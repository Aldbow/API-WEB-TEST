/**
 * Sync API Route
 * Handles incremental data synchronization for INAPROC endpoints
 */

import { NextResponse } from 'next/server';
import { getSyncState, updateSyncState, ensureEndpointFolder } from '@/lib/sync-state';
import { appendToExcel, getFileInfo } from '@/lib/excel-service';
import { getFilePath } from '@/lib/drive-config';

const BASE_URL = 'https://data.inaproc.id/api';
const JWT_TOKEN = process.env.JWT_TOKEN;

// Configuration for retries
const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    timeout: 30000, // 30 seconds
};

interface SyncResult {
    success: boolean;
    endpoint: string;
    year: string;
    newRecords: number;
    duplicatesSkipped: number;
    totalRecords: number;
    filePath: string;
    isComplete: boolean;
    error?: string;
    verificationStatus?: 'verified' | 'mismatch' | 'unchecked';
}

/**
 * Fetch with retry logic and timeout
 */
async function fetchWithRetry(url: string, options: RequestInit, retryCount = 0): Promise<Response> {
    try {
        // Create controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), RETRY_CONFIG.timeout);

        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Success or non-retriable error
        if (res.ok || res.status === 400 || res.status === 401 || res.status === 404) {
            return res;
        }

        // Retriable status codes (Server errors, Rate limit)
        if ([429, 500, 502, 503, 504].includes(res.status)) {
            throw new Error(`Retriable error: ${res.status}`);
        }

        return res;
    } catch (error: any) {
        if (retryCount >= RETRY_CONFIG.maxRetries) {
            throw error;
        }

        // Calculate backoff delay
        const delay = Math.min(
            RETRY_CONFIG.initialDelay * Math.pow(2, retryCount),
            RETRY_CONFIG.maxDelay
        );

        console.log(`Sync request failed (${error.message}). Retrying in ${delay}ms... (Attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retryCount + 1);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { endpoint, year, batchSize = 100, maxPages = 10 } = body;

        if (!endpoint || !year) {
            return NextResponse.json(
                { error: 'Missing required fields: endpoint, year' },
                { status: 400 }
            );
        }

        if (!JWT_TOKEN) {
            return NextResponse.json(
                { error: 'JWT_TOKEN not configured' },
                { status: 500 }
            );
        }

        // Basic security check
        if (!endpoint.startsWith('/v1/')) {
            return NextResponse.json(
                { error: 'Invalid endpoint' },
                { status: 400 }
            );
        }

        // Ensure folder exists
        await ensureEndpointFolder(endpoint);

        // Get current sync state
        const currentState = await getSyncState(endpoint, year);

        // Check if file actually exists - if not, reset sync state
        const fileInfo = await getFileInfo(endpoint, year);
        let currentCursor: string | null = null;
        let finalVerification: 'verified' | 'mismatch' | 'unchecked' = 'unchecked';

        if (fileInfo.exists && currentState?.lastCursor) {
            // File exists and we have a cursor, continue from where we left off
            currentCursor = currentState.lastCursor;
            console.log(`Continuing sync from cursor for ${endpoint} ${year}`);
        } else if (!fileInfo.exists && currentState?.totalRecords) {
            // File was deleted but state exists, reset and start fresh
            console.log(`File missing for ${endpoint} ${year}, starting fresh sync`);
            currentCursor = null;
        } else {
            console.log(`Starting new sync for ${endpoint} ${year}`);
        }

        let totalNewRecords = 0;
        let totalDuplicatesSkipped = 0;
        let pagesFetched = 0;
        let isComplete = false;

        // Fetch data in pages
        while (pagesFetched < maxPages) {
            // Build API URL
            let apiUrl = `${BASE_URL}${endpoint}?limit=${batchSize}&tahun=${year}`;
            apiUrl += `&kode_klpd=K34`;

            if (currentCursor) {
                apiUrl += `&cursor=${encodeURIComponent(currentCursor)}`;
            }

            // Fetch from INAPROC API with retry
            try {
                const res = await fetchWithRetry(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${JWT_TOKEN}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                });

                if (!res.ok) {
                    const errorText = await res.text().catch(() => 'Unknown error');
                    throw new Error(`API Error: ${res.status} - ${errorText}`);
                }

                const result = await res.json();
                const pageData = result.data || [];

                if (pageData.length === 0) {
                    isComplete = true;
                    break;
                }

                // Append to Excel with deduplication
                const excelResult = await appendToExcel(endpoint, year, pageData);

                if (!excelResult.success) {
                    throw new Error(excelResult.error || 'Failed to append to Excel');
                }

                totalNewRecords += excelResult.newRecords;
                totalDuplicatesSkipped += excelResult.duplicatesSkipped;

                // Get next cursor
                const nextCursor = result.cursor || (result.meta && result.meta.cursor);

                // Update state
                const newState = {
                    lastCursor: nextCursor || null,
                    totalRecords: excelResult.totalRecords,
                    filePath: excelResult.filePath,
                };

                await updateSyncState(endpoint, year, newState);

                if (!nextCursor || result.has_more === false) {
                    isComplete = true;
                    // Final Verification Check
                    const finalFileCheck = await getFileInfo(endpoint, year);
                    if (finalFileCheck.recordCount === newState.totalRecords) {
                        finalVerification = 'verified';
                    } else {
                        console.warn(`Verification Mismatch for ${endpoint} ${year}: State says ${newState.totalRecords}, File has ${finalFileCheck.recordCount}`);
                        finalVerification = 'mismatch';
                    }
                    break;
                }

                currentCursor = nextCursor;
                pagesFetched++;

                // Small delay to be nice to the API
                await new Promise((r) => setTimeout(r, 200));

            } catch (error: any) {
                // If we hit an error after retries, we return partial success so we don't lose progress
                console.error(`Error during sync page ${pagesFetched + 1}:`, error);

                // Get final file info to return accurate status
                const finalFileInfo = await getFileInfo(endpoint, year);

                return NextResponse.json({
                    success: true, // true because we might have saved some data
                    endpoint,
                    year,
                    newRecords: totalNewRecords,
                    duplicatesSkipped: totalDuplicatesSkipped,
                    totalRecords: finalFileInfo.recordCount,
                    filePath: getFilePath(endpoint, year),
                    isComplete: false,
                    error: `Sync interrupted: ${error.message}`,
                    verificationStatus: 'unchecked'
                });
            }
        }

        // Get final file info
        const finalFileInfo = await getFileInfo(endpoint, year);

        // If we didn't verify inside the loop (e.g. maxPages hit), verify now
        if (finalVerification === 'unchecked' && isComplete) {
            const currentState = await getSyncState(endpoint, year);
            if (currentState && currentState.totalRecords === finalFileInfo.recordCount) {
                finalVerification = 'verified';
            } else {
                finalVerification = 'mismatch';
            }
        }

        const syncResult: SyncResult = {
            success: true,
            endpoint,
            year,
            newRecords: totalNewRecords,
            duplicatesSkipped: totalDuplicatesSkipped,
            totalRecords: finalFileInfo.recordCount,
            filePath: getFilePath(endpoint, year),
            isComplete,
            verificationStatus: finalVerification
        };

        return NextResponse.json(syncResult);
    } catch (error: any) {
        console.error('Sync error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message,
            },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    // GET method for checking sync status
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const year = searchParams.get('year');

    if (!endpoint || !year) {
        return NextResponse.json(
            { error: 'Missing required params: endpoint, year' },
            { status: 400 }
        );
    }

    try {
        const state = await getSyncState(endpoint, year);
        const fileInfo = await getFileInfo(endpoint, year);

        return NextResponse.json({
            endpoint,
            year,
            syncState: state,
            fileInfo,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

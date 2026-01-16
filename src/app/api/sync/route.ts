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
        let currentCursor = currentState?.lastCursor || null;

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

            // Fetch from INAPROC API
            const res = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${JWT_TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            if (!res.ok) {
                const errorText = await res.text();
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

            if (!nextCursor || result.has_more === false) {
                isComplete = true;
                // Update sync state with null cursor to indicate completion
                await updateSyncState(endpoint, year, {
                    lastCursor: null,
                    totalRecords: excelResult.totalRecords,
                    filePath: excelResult.filePath,
                });
                break;
            }

            currentCursor = nextCursor;

            // Update sync state after each batch
            await updateSyncState(endpoint, year, {
                lastCursor: currentCursor,
                totalRecords: excelResult.totalRecords,
                filePath: excelResult.filePath,
            });

            pagesFetched++;

            // Small delay to be nice to the API
            await new Promise((r) => setTimeout(r, 200));
        }

        // Get final file info
        const fileInfo = await getFileInfo(endpoint, year);

        const syncResult: SyncResult = {
            success: true,
            endpoint,
            year,
            newRecords: totalNewRecords,
            duplicatesSkipped: totalDuplicatesSkipped,
            totalRecords: fileInfo.recordCount,
            filePath: getFilePath(endpoint, year),
            isComplete,
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

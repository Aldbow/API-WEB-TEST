/**
 * Excel Service
 * Handles Excel file operations with deduplication support
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getFilePath, getUniqueKeyFields } from './drive-config';
import { ensureEndpointFolder } from './sync-state';

export interface ExcelOperationResult {
    success: boolean;
    newRecords: number;
    duplicatesSkipped: number;
    totalRecords: number;
    filePath: string;
    error?: string;
}

/**
 * Generate a unique key for a record based on endpoint-specific fields
 */
function generateRecordKey(record: any, keyFields: string[]): string {
    return keyFields
        .map(field => String(record[field] || ''))
        .join('|');
}

/**
 * Load existing records from Excel file
 */
export async function loadExistingRecords(
    filePath: string
): Promise<{ records: any[]; keys: Set<string>; keyFields: string[] }> {
    if (!fs.existsSync(filePath)) {
        return { records: [], keys: new Set(), keyFields: [] };
    }

    try {
        // Use buffer approach for better Windows compatibility
        const buffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const records = XLSX.utils.sheet_to_json(sheet);

        // Extract endpoint from file path to get key fields
        const fileName = path.basename(filePath, '.xlsx');
        const endpointName = fileName.split('_')[0];

        // Try to find key fields from the metadata sheet or use default
        let keyFields: string[] = ['kode_rup']; // Default
        if (workbook.SheetNames.includes('_metadata')) {
            const metaSheet = workbook.Sheets['_metadata'];
            const metaData = XLSX.utils.sheet_to_json(metaSheet);
            if (metaData.length > 0 && (metaData[0] as any).keyFields) {
                keyFields = JSON.parse((metaData[0] as any).keyFields);
            }
        }

        // Build set of existing keys for fast deduplication
        const keys = new Set<string>();
        records.forEach(record => {
            const key = generateRecordKey(record, keyFields);
            keys.add(key);
        });

        return { records, keys, keyFields };
    } catch (error) {
        console.error('Error loading existing records:', error);
        return { records: [], keys: new Set(), keyFields: [] };
    }
}

/**
 * Append new records to Excel file with deduplication
 */
export async function appendToExcel(
    endpoint: string,
    year: string,
    newData: any[]
): Promise<ExcelOperationResult> {
    const filePath = getFilePath(endpoint, year);
    const keyFields = getUniqueKeyFields(endpoint);

    try {
        // Ensure folder exists
        await ensureEndpointFolder(endpoint);

        // Load existing data
        const { records: existingRecords, keys: existingKeys } = await loadExistingRecords(filePath);

        // Filter out duplicates
        let duplicatesSkipped = 0;
        const uniqueNewRecords: any[] = [];

        for (const record of newData) {
            const key = generateRecordKey(record, keyFields);
            if (!existingKeys.has(key)) {
                uniqueNewRecords.push(record);
                existingKeys.add(key); // Add to set to prevent duplicates within new batch
            } else {
                duplicatesSkipped++;
            }
        }

        // Combine existing and new records
        const allRecords = [...existingRecords, ...uniqueNewRecords];

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Add data sheet
        const dataSheet = XLSX.utils.json_to_sheet(allRecords);
        XLSX.utils.book_append_sheet(workbook, dataSheet, `Data ${year}`);

        // Add metadata sheet for deduplication info
        const metaData = [{
            endpoint,
            year,
            keyFields: JSON.stringify(keyFields),
            lastUpdated: new Date().toISOString(),
            totalRecords: allRecords.length,
        }];
        const metaSheet = XLSX.utils.json_to_sheet(metaData);
        XLSX.utils.book_append_sheet(workbook, metaSheet, '_metadata');

        // Write file using buffer approach for better Windows compatibility
        console.log('Writing Excel file to:', filePath);
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        fs.writeFileSync(filePath, buffer);
        console.log('Excel file written successfully');

        return {
            success: true,
            newRecords: uniqueNewRecords.length,
            duplicatesSkipped,
            totalRecords: allRecords.length,
            filePath,
        };
    } catch (error: any) {
        console.error('Error appending to Excel:', error);
        return {
            success: false,
            newRecords: 0,
            duplicatesSkipped: 0,
            totalRecords: 0,
            filePath,
            error: error.message,
        };
    }
}

/**
 * Get file info for an endpoint/year
 */
export async function getFileInfo(
    endpoint: string,
    year: string
): Promise<{
    exists: boolean;
    path: string;
    size: number;
    recordCount: number;
}> {
    const filePath = getFilePath(endpoint, year);

    if (!fs.existsSync(filePath)) {
        return {
            exists: false,
            path: filePath,
            size: 0,
            recordCount: 0,
        };
    }

    try {
        const stats = fs.statSync(filePath);
        const { records } = await loadExistingRecords(filePath);

        return {
            exists: true,
            path: filePath,
            size: stats.size,
            recordCount: records.length,
        };
    } catch (error) {
        return {
            exists: false,
            path: filePath,
            size: 0,
            recordCount: 0,
        };
    }
}

/**
 * Delete data file for an endpoint/year (for testing or reset)
 */
export async function deleteDataFile(
    endpoint: string,
    year: string
): Promise<boolean> {
    const filePath = getFilePath(endpoint, year);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }

    return true;
}

/**
 * Sync State Management
 * Tracks the synchronization state for each endpoint/year combination
 */

import * as fs from 'fs';
import * as path from 'path';
import { DRIVE_CONFIG, getFilePath, getFolderPath } from './drive-config';

export interface EndpointSyncState {
    lastCursor: string | null;
    lastSyncDate: string;
    totalRecords: number;
    filePath: string;
}

export interface SyncStateStore {
    [endpoint: string]: {
        [year: string]: EndpointSyncState;
    };
}

export interface ScheduleConfig {
    enabled: boolean;
    type: 'daily' | 'weekly';
    lastRun: string | null;
    endpoints: string[]; // List of endpoints to sync on schedule
}

export interface FullSyncState {
    syncState: SyncStateStore;
    schedule: ScheduleConfig;
}

const SYNC_STATE_FILE = 'sync-state.json';

/**
 * Get the full path to the sync state file
 */
function getSyncStateFilePath(): string {
    return path.join(DRIVE_CONFIG.basePath, SYNC_STATE_FILE);
}

/**
 * Ensure the base directory exists
 */
export async function ensureBaseDirectory(): Promise<void> {
    const basePath = DRIVE_CONFIG.basePath;
    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
    }
}

/**
 * Ensure endpoint folder exists
 */
export async function ensureEndpointFolder(endpoint: string): Promise<string> {
    // First ensure base directory exists
    await ensureBaseDirectory();

    // Get folder path directly using getFolderPath
    const folderPath = getFolderPath(endpoint);

    console.log('Ensuring folder exists:', folderPath);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log('Created folder:', folderPath);
    }

    return folderPath;
}

/**
 * Load the full sync state from file
 */
export async function loadFullSyncState(): Promise<FullSyncState> {
    await ensureBaseDirectory();
    const filePath = getSyncStateFilePath();

    const defaultState: FullSyncState = {
        syncState: {},
        schedule: {
            enabled: false,
            type: 'daily',
            lastRun: null,
            endpoints: [],
        },
    };

    if (!fs.existsSync(filePath)) {
        return defaultState;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
            ...defaultState,
            ...parsed,
        };
    } catch (error) {
        console.error('Error loading sync state:', error);
        return defaultState;
    }
}

/**
 * Save the full sync state to file
 */
export async function saveFullSyncState(state: FullSyncState): Promise<void> {
    await ensureBaseDirectory();
    const filePath = getSyncStateFilePath();

    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Get sync state for a specific endpoint and year
 */
export async function getSyncState(
    endpoint: string,
    year: string
): Promise<EndpointSyncState | null> {
    const fullState = await loadFullSyncState();
    return fullState.syncState[endpoint]?.[year] || null;
}

/**
 * Update sync state for a specific endpoint and year
 */
export async function updateSyncState(
    endpoint: string,
    year: string,
    update: Partial<EndpointSyncState>
): Promise<void> {
    const fullState = await loadFullSyncState();

    if (!fullState.syncState[endpoint]) {
        fullState.syncState[endpoint] = {};
    }

    const existingState = fullState.syncState[endpoint][year] || {
        lastCursor: null,
        lastSyncDate: new Date().toISOString(),
        totalRecords: 0,
        filePath: getFilePath(endpoint, year),
    };

    fullState.syncState[endpoint][year] = {
        ...existingState,
        ...update,
        lastSyncDate: new Date().toISOString(),
    };

    await saveFullSyncState(fullState);
}

/**
 * Get all sync states for display
 */
export async function getAllSyncStates(): Promise<SyncStateStore> {
    const fullState = await loadFullSyncState();
    return fullState.syncState;
}

/**
 * Get schedule configuration
 */
export async function getScheduleConfig(): Promise<ScheduleConfig> {
    const fullState = await loadFullSyncState();
    return fullState.schedule;
}

/**
 * Update schedule configuration
 */
export async function updateScheduleConfig(
    update: Partial<ScheduleConfig>
): Promise<void> {
    const fullState = await loadFullSyncState();
    fullState.schedule = {
        ...fullState.schedule,
        ...update,
    };
    await saveFullSyncState(fullState);
}

/**
 * Check if a scheduled sync is due
 */
export async function isScheduledSyncDue(): Promise<boolean> {
    const schedule = await getScheduleConfig();

    if (!schedule.enabled) {
        return false;
    }

    if (!schedule.lastRun) {
        return true; // Never run before
    }

    const lastRun = new Date(schedule.lastRun);
    const now = new Date();
    const diffHours = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

    if (schedule.type === 'daily' && diffHours >= 24) {
        return true;
    }

    if (schedule.type === 'weekly' && diffHours >= 168) { // 7 days
        return true;
    }

    return false;
}

/**
 * Reset sync state for a specific endpoint (for testing or re-sync)
 */
export async function resetSyncState(
    endpoint: string,
    year: string
): Promise<void> {
    const fullState = await loadFullSyncState();

    if (fullState.syncState[endpoint]?.[year]) {
        delete fullState.syncState[endpoint][year];
        await saveFullSyncState(fullState);
    }
}

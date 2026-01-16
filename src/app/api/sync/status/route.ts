/**
 * Sync Status API Route
 * Returns the sync status for all endpoints or a specific endpoint
 */

import { NextResponse } from 'next/server';
import { getAllSyncStates, getScheduleConfig, getSyncState } from '@/lib/sync-state';
import { getFileInfo } from '@/lib/excel-service';
import { ENDPOINTS } from '@/lib/constants';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const year = searchParams.get('year');

    try {
        // If specific endpoint requested
        if (endpoint && year) {
            const state = await getSyncState(endpoint, year);
            const fileInfo = await getFileInfo(endpoint, year);
            const schedule = await getScheduleConfig();

            return NextResponse.json({
                endpoint,
                year,
                state,
                fileInfo,
                schedule,
            });
        }

        // Return all states
        const allStates = await getAllSyncStates();
        const schedule = await getScheduleConfig();

        // Build comprehensive status for all endpoints
        const endpointStatuses = ENDPOINTS.map((ep) => {
            const endpointStates = allStates[ep.value] || {};
            const years = Object.keys(endpointStates);

            return {
                endpoint: ep.value,
                label: ep.label,
                years: years.map((y) => ({
                    year: y,
                    state: endpointStates[y],
                })),
                lastSynced: years.length > 0
                    ? Object.values(endpointStates).reduce((latest, state) => {
                        const stateDate = new Date(state.lastSyncDate);
                        return stateDate > latest ? stateDate : latest;
                    }, new Date(0))
                    : null,
            };
        });

        return NextResponse.json({
            endpoints: endpointStatuses,
            schedule,
            basePath: process.env.INAPROC_DATA_PATH || 'D:/INAPROC-Data',
        });
    } catch (error: any) {
        console.error('Error getting sync status:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

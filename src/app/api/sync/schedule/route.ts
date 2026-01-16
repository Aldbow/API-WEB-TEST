/**
 * Schedule API Route
 * Manages sync scheduling configuration
 */

import { NextResponse } from 'next/server';
import {
    getScheduleConfig,
    updateScheduleConfig,
    isScheduledSyncDue,
    getAllSyncStates,
} from '@/lib/sync-state';
import { ENDPOINTS } from '@/lib/constants';

// GET - Get current schedule config
export async function GET() {
    try {
        const schedule = await getScheduleConfig();
        const isDue = await isScheduledSyncDue();

        return NextResponse.json({
            schedule,
            isDue,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// POST - Update schedule config
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { enabled, type, endpoints } = body;

        const updates: any = {};

        if (typeof enabled === 'boolean') {
            updates.enabled = enabled;
        }

        if (type === 'daily' || type === 'weekly') {
            updates.type = type;
        }

        if (Array.isArray(endpoints)) {
            // Validate endpoints exist
            const validEndpoints = endpoints.filter((ep: string) =>
                ENDPOINTS.some((e) => e.value === ep)
            );
            updates.endpoints = validEndpoints;
        }

        await updateScheduleConfig(updates);
        const newSchedule = await getScheduleConfig();

        return NextResponse.json({
            success: true,
            schedule: newSchedule,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

// PUT - Mark schedule as run (update lastRun)
export async function PUT() {
    try {
        await updateScheduleConfig({
            lastRun: new Date().toISOString(),
        });

        const schedule = await getScheduleConfig();

        return NextResponse.json({
            success: true,
            schedule,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

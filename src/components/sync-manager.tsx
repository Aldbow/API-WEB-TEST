'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Loader2,
    RefreshCw,
    Download,
    CheckCircle,
    AlertCircle,
    Clock,
    FolderOpen,
    Zap,
    PlayCircle,
    PauseCircle,
} from 'lucide-react';
import { ENDPOINTS, getSyncableEndpoints } from '@/lib/constants';

interface SyncState {
    lastCursor: string | null;
    lastSyncDate: string;
    totalRecords: number;
    filePath: string;
}

interface EndpointStatus {
    endpoint: string;
    label: string;
    years: { year: string; state: SyncState }[];
    lastSynced: string | null;
}

interface ScheduleConfig {
    enabled: boolean;
    type: 'daily' | 'weekly';
    lastRun: string | null;
    endpoints: string[];
}

interface SyncManagerProps {
    year: string;
    onSyncComplete?: () => void;
}

export function SyncManager({ year, onSyncComplete }: SyncManagerProps) {
    const [statuses, setStatuses] = useState<EndpointStatus[]>([]);
    const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [batchSyncing, setBatchSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState<Record<string, { status: string; records: number }>>({});
    const [basePath, setBasePath] = useState<string>('');

    // Fetch sync status
    const fetchStatus = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/sync/status');
            const data = await res.json();
            setStatuses(data.endpoints || []);
            setSchedule(data.schedule || null);
            setBasePath(data.basePath || '');
        } catch (error) {
            console.error('Failed to fetch status:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    // Reset sync progress when year changes
    useEffect(() => {
        setSyncProgress({});
    }, [year]);

    // Sync a single endpoint
    const syncEndpoint = async (endpoint: string) => {
        setSyncing(endpoint);

        setSyncProgress((prev) => ({
            ...prev,
            [endpoint]: { status: 'syncing', records: 0 },
        }));

        try {
            let isComplete = false;


            while (!isComplete) {
                const res = await fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endpoint,
                        year,
                        batchSize: 100, // Max limit allowed by API
                        maxPages: 50, // Process 50 pages (5000 records) per batch write
                    }),
                });

                const result = await res.json();

                if (!result.success) {
                    throw new Error(result.error || 'Sync failed');
                }


                isComplete = result.isComplete;

                setSyncProgress((prev) => ({
                    ...prev,
                    [endpoint]: {
                        status: isComplete ? 'complete' : 'syncing',
                        records: result.totalRecords,
                    },
                }));

                // Small delay between batches
                if (!isComplete) {
                    await new Promise((r) => setTimeout(r, 500));
                }
            }

            setSyncProgress((prev) => ({
                ...prev,
                [endpoint]: { status: 'complete', records: prev[endpoint]?.records || 0 },
            }));

            // Only refetch status if NOT in a batch process (optimization) to avoid flickering
            if (!batchSyncing) {
                await fetchStatus();
            }
            onSyncComplete?.();
        } catch (error: any) {
            console.error('Sync error:', error);
            setSyncProgress((prev) => ({
                ...prev,
                [endpoint]: { status: 'error', records: 0 },
            }));
        } finally {
            setSyncing(null);
        }
    };

    // Batch sync all endpoints (excluding detail endpoints that require IDs)
    const batchSync = async () => {
        setBatchSyncing(true);
        const syncableEndpoints = getSyncableEndpoints();

        for (const ep of syncableEndpoints) {
            if (!batchSyncing) break; // Allow cancellation logic if we add it
            await syncEndpoint(ep.value);
        }

        setBatchSyncing(false);
        await fetchStatus();
    };

    // Update schedule
    const updateSchedule = async (updates: Partial<ScheduleConfig>) => {
        try {
            const res = await fetch('/api/sync/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            const data = await res.json();
            setSchedule(data.schedule);
        } catch (error) {
            console.error('Failed to update schedule:', error);
        }
    };

    // Format date
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Belum pernah sync';
        const date = new Date(dateStr);
        return date.toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Get status badge for endpoint
    const getStatusBadge = (endpoint: string, status: EndpointStatus) => {
        const progress = syncProgress[endpoint];
        const yearState = status.years.find((y) => y.year === year);

        if (progress?.status === 'syncing') {
            return (
                <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Syncing...
                </Badge>
            );
        }

        if (progress?.status === 'complete') {
            return (
                <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700">
                    <CheckCircle className="h-3 w-3" />
                    Complete
                </Badge>
            );
        }

        if (progress?.status === 'error') {
            return (
                <Badge variant="secondary" className="gap-1 bg-red-100 text-red-700">
                    <AlertCircle className="h-3 w-3" />
                    Error
                </Badge>
            );
        }

        if (yearState) {
            return (
                <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-700">
                    <Clock className="h-3 w-3" />
                    {yearState.state.totalRecords.toLocaleString()} records
                </Badge>
            );
        }

        return (
            <Badge variant="outline" className="text-slate-400">
                Belum sync
            </Badge>
        );
    };

    return (
        <Card className="bg-white dark:bg-slate-900 border-none shadow-sm">
            <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-950/50">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-blue-600" />
                            Sync Manager
                        </CardTitle>
                        <CardDescription>
                            Download dan simpan data INAPROC ke folder lokal
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchStatus}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                                // Explicit sequential sync (working 1-by-1)
                                if (syncing) return;
                                const syncableEndpoints = getSyncableEndpoints();
                                for (const ep of syncableEndpoints) {
                                    await syncEndpoint(ep.value);
                                }
                                await fetchStatus();
                            }}
                            disabled={syncing !== null || batchSyncing}
                            className="bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                        >
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Auto Sync (Seq)
                        </Button>
                        <Button
                            size="sm"
                            onClick={batchSync}
                            disabled={batchSyncing || syncing !== null}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600"
                        >
                            {batchSyncing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Batch Syncing...
                                </>
                            ) : (
                                <>
                                    <Zap className="h-4 w-4 mr-1" />
                                    Sync Semua
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
                {/* Schedule Section */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-lg p-4 border border-indigo-100 dark:border-indigo-900">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-indigo-600" />
                            <div>
                                <h4 className="font-semibold text-sm">Auto-Sync Schedule</h4>
                                <p className="text-xs text-slate-500">
                                    {schedule?.lastRun
                                        ? `Terakhir: ${formatDate(schedule.lastRun)}`
                                        : 'Jadwalkan sync otomatis'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={schedule?.type || 'daily'}
                                onValueChange={(value) =>
                                    updateSchedule({ type: value as 'daily' | 'weekly' })
                                }
                            >
                                <SelectTrigger className="w-[120px] h-8 text-xs bg-white dark:bg-slate-900">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Harian</SelectItem>
                                    <SelectItem value="weekly">Mingguan</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                variant={schedule?.enabled ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => updateSchedule({ enabled: !schedule?.enabled })}
                                className={schedule?.enabled ? 'bg-green-600 hover:bg-green-700' : ''}
                            >
                                {schedule?.enabled ? (
                                    <>
                                        <PauseCircle className="h-4 w-4 mr-1" />
                                        Aktif
                                    </>
                                ) : (
                                    <>
                                        <PlayCircle className="h-4 w-4 mr-1" />
                                        Aktifkan
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Endpoints List */}
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm text-slate-600">
                        Endpoints ({ENDPOINTS.length})
                    </h4>
                    <ScrollArea className="h-[400px] rounded-md border">
                        <div className="p-2 space-y-1">
                            {statuses.length === 0 && !loading ? (
                                <div className="text-center py-8 text-slate-400">
                                    Belum ada data sync
                                </div>
                            ) : (
                                statuses.map((status) => {
                                    const yearState = status.years.find((y) => y.year === year);
                                    const progress = syncProgress[status.endpoint];

                                    return (
                                        <div
                                            key={status.endpoint}
                                            className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm truncate">
                                                        {status.label}
                                                    </span>
                                                    {getStatusBadge(status.endpoint, status)}
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                                    {yearState && (
                                                        <>
                                                            <span>📁 {yearState.state.filePath}</span>
                                                            <span>•</span>
                                                            <span>{formatDate(yearState.state.lastSyncDate)}</span>
                                                        </>
                                                    )}
                                                    {progress?.records > 0 && (
                                                        <span className="text-blue-500">
                                                            {progress.records.toLocaleString()} records
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => syncEndpoint(status.endpoint)}
                                                disabled={syncing !== null || batchSyncing}
                                                className="shrink-0"
                                            >
                                                {syncing === status.endpoint ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Download className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* Footer Info */}
                <div className="text-xs text-slate-400 flex items-center gap-2 pt-2 border-t">
                    <FolderOpen className="h-3 w-3" />
                    <span>Data disimpan ke: {basePath}</span>
                </div>
            </CardContent>
        </Card>
    );
}

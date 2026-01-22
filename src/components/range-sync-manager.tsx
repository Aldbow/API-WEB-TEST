'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Loader2,
    Calendar,
    Zap,
    History,
    FileSpreadsheet
} from 'lucide-react';
import { ENDPOINTS, getSyncableEndpoints } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';

export function RangeSyncManager() {
    const [rangeSyncConfig, setRangeSyncConfig] = useState({
        startYear: '2021',
        endYear: '2026',
        currentYear: null as string | null,
        isSyncing: false
    });

    // Stats interface
    interface SyncStat {
        endpoint: string;
        year: string;
        newRecords: number;
        duplicatesOrTotal: number; // Duplicates for V1, Total for Legacy (Overwrite)
        status: 'success' | 'error';
        message?: string;
    }

    const [stats, setStats] = useState<SyncStat[]>([]);

    // Restoring missing state variables
    const [activeTab, setActiveTab] = useState<'v1' | 'legacy'>('v1');
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [syncingEndpoint, setSyncingEndpoint] = useState<string | null>(null);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    const addStat = (stat: SyncStat) => {
        setStats(prev => [...prev, stat]);
    };

    const syncEndpoint = async (endpoint: string, year: string) => {
        setSyncingEndpoint(endpoint);
        try {
            let isComplete = false;
            let totalNew = 0;
            let totalSkipped = 0;
            let totalRecords = 0;

            // Loop for pagination within the endpoint
            while (!isComplete) {
                const res = await fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        endpoint,
                        year,
                        batchSize: 100,
                        maxPages: 50,
                    }),
                });

                const result = await res.json();
                if (!result.success) throw new Error(result.error || 'Sync failed');

                totalNew += result.newRecords;
                totalSkipped += result.duplicatesSkipped;
                totalRecords = result.totalRecords;
                isComplete = result.isComplete;

                if (!isComplete) await new Promise((r) => setTimeout(r, 500));
            }

            const endpointLabel = ENDPOINTS.find(e => e.value === endpoint)?.label || endpoint;
            addLog(`Completed ${endpointLabel} (${year}): ${totalNew} new records.`);

            addStat({
                endpoint: endpointLabel,
                year,
                newRecords: totalNew,
                duplicatesOrTotal: activeTab === 'v1' ? totalSkipped : totalRecords, // Show context-aware stat
                status: 'success'
            });

        } catch (error: any) {
            console.error('Sync error:', error);
            const endpointLabel = ENDPOINTS.find(e => e.value === endpoint)?.label || endpoint;
            addLog(`Error syncing ${endpointLabel} (${year}): ${error.message}`);

            addStat({
                endpoint: endpointLabel,
                year,
                newRecords: 0,
                duplicatesOrTotal: 0,
                status: 'error',
                message: error.message
            });
        } finally {
            setSyncingEndpoint(null);
        }
    };

    const handleRangeSync = async () => {
        const start = parseInt(rangeSyncConfig.startYear);
        const end = parseInt(rangeSyncConfig.endYear);

        if (isNaN(start) || isNaN(end) || start > end) {
            alert("Invalid year range");
            return;
        }

        setRangeSyncConfig(prev => ({ ...prev, isSyncing: true }));
        setLogs([]);
        setStats([]); // Reset stats on new run
        setProgress(0);
        addLog(`Starting ${activeTab.toUpperCase()} range sync from ${start} to ${end}...`);

        // Filter endpoints based on active tab
        const allEndpoints = getSyncableEndpoints();
        const targetEndpoints = allEndpoints.filter(ep => activeTab === 'v1' ? ep.type === 'v1' : ep.type === 'legacy');

        if (targetEndpoints.length === 0) {
            addLog("No endpoints found for this category.");
            setRangeSyncConfig(prev => ({ ...prev, isSyncing: false }));
            return;
        }

        const totalSteps = (end - start + 1) * targetEndpoints.length;
        let completedSteps = 0;

        try {
            for (let y = start; y <= end; y++) {
                const yearStr = String(y);
                setRangeSyncConfig(prev => ({ ...prev, currentYear: yearStr }));
                addLog(`--- Processing Year ${yearStr} ---`);

                for (const ep of targetEndpoints) {
                    await syncEndpoint(ep.value, yearStr);
                    completedSteps++;
                    setProgress(Math.round((completedSteps / totalSteps) * 100));
                }
            }
            addLog('Range sync completed successfully.');
        } finally {
            setRangeSyncConfig(prev => ({ ...prev, isSyncing: false, currentYear: null }));
        }
    };

    // Calculate Summary Stats
    const totalNewRows = stats.reduce((acc, curr) => acc + curr.newRecords, 0);
    const totalProcessed = stats.length;
    const errors = stats.filter(s => s.status === 'error').length;

    return (
        <div className="space-y-6">
            <Card className="bg-white dark:bg-slate-900 border-none shadow-sm">
                <CardHeader className="border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                    <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <History className="h-5 w-5" />
                        Range Sync Manager
                    </CardTitle>
                    <CardDescription>
                        Batch download and synchronize data across multiple years.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    {/* Category Tabs */}
                    <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
                        <Button
                            variant={activeTab === 'v1' ? 'default' : 'ghost'}
                            size="sm"
                            className={activeTab === 'v1' ? 'bg-white text-emerald-700 shadow-sm hover:bg-white/90' : 'text-slate-500 hover:text-emerald-700'}
                            onClick={() => setActiveTab('v1')}
                        >
                            V1 API (Modern)
                        </Button>
                        <Button
                            variant={activeTab === 'legacy' ? 'default' : 'ghost'}
                            size="sm"
                            className={activeTab === 'legacy' ? 'bg-white text-amber-700 shadow-sm hover:bg-white/90' : 'text-slate-500 hover:text-amber-700'}
                            onClick={() => setActiveTab('legacy')}
                        >
                            Legacy API (Archive)
                        </Button>
                    </div>

                    {/* Strategy Info */}
                    <div className={`text-xs p-3 rounded border ${activeTab === 'v1' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                        {activeTab === 'v1' ? (
                            <p><strong>Strategy: Incremental Sync.</strong> Uses cursors to fetch only new data. Fast and efficient.</p>
                        ) : (
                            <p><strong>Strategy: Overwrite Sync.</strong> Downloads fresh full dataset and replaces existing files to guarantee no duplicates.</p>
                        )}
                    </div>

                    <div className="flex flex-col md:flex-row gap-6 items-end">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">From Year</label>
                            <Select value={rangeSyncConfig.startYear} onValueChange={(v) => setRangeSyncConfig(prev => ({ ...prev, startYear: v }))}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 2026 - 2018 + 1 }, (_, i) => 2026 - i).map((y) => (
                                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">To Year</label>
                            <Select value={rangeSyncConfig.endYear} onValueChange={(v) => setRangeSyncConfig(prev => ({ ...prev, endYear: v }))}>
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 2026 - 2018 + 1 }, (_, i) => 2026 - i).map((y) => (
                                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            size="lg"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full md:w-auto"
                            onClick={handleRangeSync}
                            disabled={rangeSyncConfig.isSyncing}
                        >
                            {rangeSyncConfig.isSyncing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Syncing...
                                </>
                            ) : (
                                <>
                                    <Zap className="h-4 w-4 mr-2" />
                                    Start Range Sync
                                </>
                            )}
                        </Button>
                    </div>

                    {rangeSyncConfig.isSyncing && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Progress</span>
                                <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="text-sm text-emerald-600 font-medium animate-pulse">
                                {rangeSyncConfig.currentYear && syncingEndpoint ?
                                    `Syncing ${ENDPOINTS.find(e => e.value === syncingEndpoint)?.label} (${rangeSyncConfig.currentYear})` :
                                    'Preparing...'}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Scorechart / Stats Panel */}
            {(stats.length > 0 || rangeSyncConfig.isSyncing) && (
                <div className="grid gap-6 md:grid-cols-3">
                    {/* Summary Cards */}
                    <Card className="md:col-span-1 bg-white dark:bg-slate-900 border shadow-sm h-fit">
                        <CardHeader className="py-4 border-b">
                            <CardTitle className="text-base">Sync Scorecard</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="p-4 rounded-lg bg-emerald-50 text-emerald-900">
                                <p className="text-xs font-semibold uppercase opacity-70">Total New Rows</p>
                                <p className="text-3xl font-bold">{totalNewRows.toLocaleString()}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-3 rounded-lg bg-slate-50">
                                    <p className="text-xs text-slate-500">Processed</p>
                                    <p className="text-lg font-semibold">{totalProcessed}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-red-50 text-red-900">
                                    <p className="text-xs opacity-70">Errors</p>
                                    <p className="text-lg font-semibold">{errors}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Detailed Table */}
                    <Card className="md:col-span-2 bg-white dark:bg-slate-900 border shadow-sm">
                        <CardHeader className="py-4 border-b">
                            <CardTitle className="text-base">Detailed Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="max-h-[300px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2">Endpoint</th>
                                            <th className="px-4 py-2 w-[80px]">Year</th>
                                            <th className="px-4 py-2 text-right w-[100px]">New Rows</th>
                                            <th className="px-4 py-2 text-right">
                                                {activeTab === 'v1' ? 'Skipped' : 'Total Size'}
                                            </th>
                                            <th className="px-4 py-2 w-[40px]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {stats.map((row, i) => (
                                            <tr key={i} className={`hover:bg-slate-50/50 ${row.newRecords > 0 ? 'bg-emerald-50/10' : ''}`}>
                                                <td className="px-4 py-2 truncate max-w-[200px]" title={row.endpoint}>
                                                    {row.endpoint.replace('Legacy:', '').replace('(Archive)', '').trim()}
                                                </td>
                                                <td className="px-4 py-2">{row.year}</td>
                                                <td className={`px-4 py-2 text-right font-medium ${row.newRecords > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {row.newRecords > 0 ? `+${row.newRecords}` : '-'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-500">
                                                    {row.duplicatesOrTotal.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    {row.status === 'success' ? (
                                                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                                                    ) : (
                                                        <span className="inline-block w-2 h-2 rounded-full bg-red-500" title={row.message} />
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card className="bg-slate-50 dark:bg-slate-900 border shadow-inner">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">Operation Logs</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[150px] overflow-y-auto font-mono text-xs space-y-1 p-2 bg-white dark:bg-black rounded border">
                        {logs.length === 0 ? (
                            <span className="text-slate-400 italic">No logs yet...</span>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="border-b border-slate-100 dark:border-slate-800 pb-1 last:border-0">
                                    {log}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

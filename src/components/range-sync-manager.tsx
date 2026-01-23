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
    FileSpreadsheet,
    Activity,
    AlertCircle,
    CheckCircle2,
    ArrowRight
} from 'lucide-react';
import { ENDPOINTS, getSyncableEndpoints } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import { FadeIn, SlideUp } from './ui/motion-primitives';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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
        <FadeIn className="space-y-6">
            <Card className="glass-card">
                <CardHeader className="border-b border-border/50 bg-secondary/20">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                            <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Range Sync Manager</CardTitle>
                            <CardDescription>
                                Batch download and synchronize data across multiple years.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6 space-y-8">
                    {/* Configuration Section */}
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="flex-1 space-y-6">
                            {/* Category Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Sync Strategy</label>
                                <div className="flex gap-2 p-1 bg-secondary/50 rounded-xl border border-border/50 w-full sm:w-fit">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "flex-1 sm:flex-none transition-all rounded-lg text-sm",
                                            activeTab === 'v1'
                                                ? "bg-background text-primary shadow-sm ring-1 ring-border/50"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() => setActiveTab('v1')}
                                    >
                                        V1 API (Modern)
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "flex-1 sm:flex-none transition-all rounded-lg text-sm",
                                            activeTab === 'legacy'
                                                ? "bg-background text-amber-600 dark:text-amber-500 shadow-sm ring-1 ring-border/50"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() => setActiveTab('legacy')}
                                    >
                                        Legacy API (Archive)
                                    </Button>
                                </div>

                                <div className={cn(
                                    "text-xs p-3 rounded-lg border",
                                    activeTab === 'v1'
                                        ? "bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200/50"
                                        : "bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border-amber-200/50"
                                )}>
                                    {activeTab === 'v1' ? (
                                        <p className="flex items-center gap-2">
                                            <Zap className="h-3 w-3" />
                                            <strong>Incremental Sync:</strong> Uses cursors to fetch only new data. Fast and efficient.
                                        </p>
                                    ) : (
                                        <p className="flex items-center gap-2">
                                            <FileSpreadsheet className="h-3 w-3" />
                                            <strong>Overwrite Sync:</strong> Downloads fresh full dataset and replaces existing files.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Year Selection */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">From Year</label>
                                    <Select value={rangeSyncConfig.startYear} onValueChange={(v) => setRangeSyncConfig(prev => ({ ...prev, startYear: v }))}>
                                        <SelectTrigger className="w-full bg-background/50">
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
                                    <label className="text-sm font-medium text-muted-foreground">To Year</label>
                                    <Select value={rangeSyncConfig.endYear} onValueChange={(v) => setRangeSyncConfig(prev => ({ ...prev, endYear: v }))}>
                                        <SelectTrigger className="w-full bg-background/50">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Array.from({ length: 2026 - 2018 + 1 }, (_, i) => 2026 - i).map((y) => (
                                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Button
                                size="lg"
                                className={cn(
                                    "w-full h-12 text-base font-semibold shadow-xl transition-all",
                                    rangeSyncConfig.isSyncing
                                        ? "bg-secondary text-secondary-foreground"
                                        : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                                )}
                                onClick={handleRangeSync}
                                disabled={rangeSyncConfig.isSyncing}
                            >
                                {rangeSyncConfig.isSyncing ? (
                                    <>
                                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                        Processing Batch Sync...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="h-5 w-5 mr-2" />
                                        Start Range Sync
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Progress Panel */}
                        <div className="flex-1">
                            <div className="bg-secondary/20 rounded-xl border border-border/50 p-6 h-full flex flex-col justify-between">
                                {rangeSyncConfig.isSyncing ? (
                                    <div className="space-y-6 animate-in fade-in duration-500">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <span className="text-sm font-medium text-primary">Total Progress</span>
                                                <span className="text-2xl font-bold text-primary">{progress}%</span>
                                            </div>
                                            <Progress value={progress} className="h-3 bg-secondary" />
                                        </div>

                                        <div className="bg-background/80 backdrop-blur-sm rounded-lg p-4 border border-border/50 space-y-2">
                                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                                <Activity className="h-4 w-4 animate-pulse text-emerald-500" />
                                                Current Action
                                            </div>
                                            <div className="text-lg font-medium">
                                                {rangeSyncConfig.currentYear && syncingEndpoint ? (
                                                    <span className="flex items-center gap-2">
                                                        Accessing {ENDPOINTS.find(e => e.value === syncingEndpoint)?.label}
                                                        <Badge variant="outline">{rangeSyncConfig.currentYear}</Badge>
                                                    </span>
                                                ) : (
                                                    'Initializing...'
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8 opacity-60">
                                        <div className="h-16 w-16 bg-muted-foreground/10 rounded-full flex items-center justify-center">
                                            <ArrowRight className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-foreground">Ready to start</p>
                                            <p className="text-sm text-muted-foreground">Select year range and click Start</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Scorechart / Stats Panel */}
                    {(stats.length > 0 || rangeSyncConfig.isSyncing) && (
                        <SlideUp className="grid gap-6 md:grid-cols-3 pt-6 border-t border-border/50">
                            {/* Summary Cards */}
                            <div className="md:col-span-1 space-y-4">
                                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Session Summary</h3>
                                <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 text-emerald-900 dark:text-emerald-100">
                                    <p className="text-xs font-bold uppercase opacity-60 mb-1">Total New Rows</p>
                                    <p className="text-4xl font-bold tracking-tight">{totalNewRows.toLocaleString()}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-4 rounded-xl bg-secondary/50 border border-border/50">
                                        <p className="text-xs text-muted-foreground">Processed</p>
                                        <p className="text-xl font-semibold">{totalProcessed}</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400">
                                        <p className="text-xs opacity-70">Errors</p>
                                        <p className="text-xl font-semibold">{errors}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Table */}
                            <div className="md:col-span-2 flex flex-col">
                                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">Detailed Breakdown</h3>
                                <Card className="flex-1 bg-background/50 border-border/50">
                                    <ScrollArea className="h-[300px]">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-secondary/50 text-muted-foreground font-medium sticky top-0 backdrop-blur-sm z-10">
                                                <tr>
                                                    <th className="px-4 py-3">Endpoint</th>
                                                    <th className="px-4 py-3 w-[80px]">Year</th>
                                                    <th className="px-4 py-3 text-right w-[100px]">New Rows</th>
                                                    <th className="px-4 py-3 text-right">
                                                        {activeTab === 'v1' ? 'Skipped' : 'Total Size'}
                                                    </th>
                                                    <th className="px-4 py-3 w-[40px]"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/30">
                                                {stats.map((row, i) => (
                                                    <tr key={i} className={cn("hover:bg-secondary/30 transition-colors", row.newRecords > 0 ? "bg-emerald-500/5" : "")}>
                                                        <td className="px-4 py-3 truncate max-w-[200px]" title={row.endpoint}>
                                                            <span className="font-medium text-foreground">{row.endpoint.replace('Legacy:', '').replace('(Archive)', '').trim()}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-muted-foreground">{row.year}</td>
                                                        <td className={cn("px-4 py-3 text-right font-medium", row.newRecords > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                                                            {row.newRecords > 0 ? `+${row.newRecords}` : '-'}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">
                                                            {row.duplicatesOrTotal.toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {row.status === 'success' ? (
                                                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                                            ) : (
                                                                <AlertCircle className="h-4 w-4 text-red-500 mx-auto" title={row.message} />
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </ScrollArea>
                                </Card>
                            </div>
                        </SlideUp>
                    )}

                    {/* Logs Panel */}
                    <div className="pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operation Logs</h4>
                            <Badge variant="outline" className="text-[10px] h-5">{logs.length} entries</Badge>
                        </div>
                        <ScrollArea className="h-[150px] rounded-lg border border-border/50 bg-secondary/10 dark:bg-black/20 p-2">
                            <div className="font-mono text-xs space-y-1">
                                {logs.length === 0 ? (
                                    <span className="text-muted-foreground/50 italic p-2 block">No logs generated yet...</span>
                                ) : (
                                    logs.map((log, i) => (
                                        <div key={i} className="border-b border-border/30 pb-1 last:border-0 last:pb-0 text-muted-foreground/80 break-all hover:bg-secondary/30 rounded px-1">
                                            {log}
                                        </div>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </FadeIn>
    );
}

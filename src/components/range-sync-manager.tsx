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
    ArrowRight,
    Database
} from 'lucide-react';
import { ENDPOINTS, getSyncableEndpoints } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import { FadeIn, SlideUp, StaggerContainer, StaggerItem, ScaleOnHover } from './ui/motion-primitives';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

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
                <CardHeader className="border-b border-border/50">
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
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Sync Strategy</label>
                                    <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg border border-border/50 w-full">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "flex-1 transition-all rounded-md text-sm font-medium h-9",
                                                activeTab === 'v1'
                                                    ? "bg-background text-primary shadow-sm ring-1 ring-border/50"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                            )}
                                            onClick={() => setActiveTab('v1')}
                                        >
                                            V1 API (Modern)
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={cn(
                                                "flex-1 transition-all rounded-md text-sm font-medium h-9",
                                                activeTab === 'legacy'
                                                    ? "bg-background text-amber-600 dark:text-amber-500 shadow-sm ring-1 ring-border/50"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                            )}
                                            onClick={() => setActiveTab('legacy')}
                                        >
                                            Legacy API (Archive)
                                        </Button>
                                    </div>
                                </div>

                                <div className={cn(
                                    "text-xs p-3 rounded-lg border transition-colors duration-300",
                                    activeTab === 'v1'
                                        ? "bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 border-blue-200/50"
                                        : "bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border-amber-200/50"
                                )}>
                                    {activeTab === 'v1' ? (
                                        <div className="flex items-start gap-2.5">
                                            <Zap className="h-4 w-4 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-semibold block mb-0.5">Incremental Sync</span>
                                                <span className="opacity-90 leading-relaxed">Uses smart cursors to fetch only new records since the last sync. Fast, efficient, and friendly to the API.</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-2.5">
                                            <FileSpreadsheet className="h-4 w-4 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-semibold block mb-0.5">Overwrite Sync</span>
                                                <span className="opacity-90 leading-relaxed">Downloads the full dataset for the selected year and replaces existing files. Use this for data consistency checks.</span>
                                            </div>
                                        </div>
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
                    {/* Scorechart / Stats Panel */}
                    {(stats.length > 0 || rangeSyncConfig.isSyncing) && (
                        <SlideUp className="grid gap-6 md:grid-cols-12 pt-6 border-t border-border/50">
                            {/* Summary Cards */}
                            <StaggerContainer className="md:col-span-4 lg:col-span-3 space-y-4" delayChildren={0.1}>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">Session Summary</h3>
                                <div className="space-y-3">
                                    <StaggerItem>
                                        <ScaleOnHover className="h-full">
                                            <div className="p-5 h-full rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 text-emerald-900 dark:text-emerald-100 relative overflow-hidden group">
                                                <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1 relative z-10">Total New Rows</p>
                                                <p className="text-4xl font-bold tracking-tight relative z-10">{totalNewRows.toLocaleString()}</p>
                                                <Database className="absolute bottom-[-10px] right-[-10px] h-24 w-24 text-emerald-500/5 rotate-[-15deg]" />
                                            </div>
                                        </ScaleOnHover>
                                    </StaggerItem>
                                    <div className="grid grid-cols-2 gap-3">
                                        <StaggerItem>
                                            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition-colors">
                                                <p className="text-[10px] font-medium opacity-80 uppercase tracking-wide">Processed</p>
                                                <p className="text-lg font-semibold mt-0.5">{totalProcessed}</p>
                                            </div>
                                        </StaggerItem>
                                        <StaggerItem>
                                            <div className={cn(
                                                "p-3 rounded-xl border transition-colors",
                                                errors > 0
                                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400 font-bold"
                                                    : "bg-rose-500/5 border-rose-500/10 text-rose-600/70 dark:text-rose-400/70"
                                            )}>
                                                <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">Errors</p>
                                                <p className="text-lg font-semibold mt-0.5">{errors}</p>
                                            </div>
                                        </StaggerItem>
                                    </div>
                                </div>
                            </StaggerContainer>

                            {/* Detailed Table */}
                            <div className="md:col-span-8 lg:col-span-9 flex flex-col">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 pl-1">Detailed Breakdown</h3>
                                <div className="rounded-2xl border border-border/50 bg-background/40 overflow-hidden flex flex-col h-full shadow-sm">
                                    <ScrollArea className="h-[280px] w-full">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-secondary/50 text-muted-foreground font-semibold sticky top-0 backdrop-blur-sm z-10 border-b border-border/50">
                                                <tr>
                                                    <th className="px-4 py-3 first:pl-5">Endpoint</th>
                                                    <th className="px-4 py-3 w-[80px]">Year</th>
                                                    <th className="px-4 py-3 text-right w-[100px]">New Rows</th>
                                                    <th className="px-4 py-3 text-right">
                                                        {activeTab === 'v1' ? 'Skipped' : 'Total Size'}
                                                    </th>
                                                    <th className="px-4 py-3 w-[50px] text-center last:pr-5">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/30">
                                                {stats.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-12 text-center text-muted-foreground italic">
                                                            Waiting for sync data...
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    stats.map((row, i) => (
                                                        <tr key={i} className={cn("group hover:bg-secondary/40 transition-colors", row.newRecords > 0 ? "bg-emerald-500/[0.02]" : "")}>
                                                            <td className="px-4 py-2.5 first:pl-5 truncate max-w-[200px]" title={row.endpoint}>
                                                                <span className="font-medium text-foreground">{row.endpoint.replace('Legacy:', '').replace('(Archive)', '').trim()}</span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-muted-foreground font-mono">{row.year}</td>
                                                            <td className={cn("px-4 py-2.5 text-right font-medium font-mono", row.newRecords > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50")}>
                                                                {row.newRecords > 0 ? `+${row.newRecords.toLocaleString()}` : '—'}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right text-muted-foreground/70 font-mono text-[10px]">
                                                                {row.duplicatesOrTotal.toLocaleString()}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-center last:pr-5">
                                                                {row.status === 'success' ? (
                                                                    <div className="flex justify-center">
                                                                        <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex justify-center">
                                                                        <div className="h-6 w-6 rounded-full bg-red-500/10 flex items-center justify-center" title={row.message}>
                                                                            <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </ScrollArea>
                                </div>
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
                            <StaggerContainer className="font-mono text-xs space-y-1">
                                {logs.length === 0 ? (
                                    <span className="text-muted-foreground/50 italic p-2 block">No logs generated yet...</span>
                                ) : (
                                    logs.map((log, i) => (
                                        <StaggerItem key={i}>
                                            <div className="border-b border-border/30 pb-1 last:border-0 last:pb-0 text-muted-foreground/80 break-all hover:bg-secondary/30 rounded px-1">
                                                {log}
                                            </div>
                                        </StaggerItem>
                                    ))
                                )}
                            </StaggerContainer>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </FadeIn>
    );
}

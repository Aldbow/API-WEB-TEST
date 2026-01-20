
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Filter, Database, TrendingUp, DollarSign, Eye, Download, Archive, Network, FolderSync, TableIcon, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DetailSheet } from "@/components/detail-sheet";
import { SyncManager } from "@/components/sync-manager";
import { ENDPOINTS, Endpoint } from "@/lib/constants";

// Mock Badge if I missed adding it, or just use span with classes if lazy. 
// But better to add it. I'll use standard tailwind classes for now to be safe.

export default function Home() {
    // Dynamic Endpoint
    const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0].value);

    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [year, setYear] = useState('2024');
    const [search, setSearch] = useState('');
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    // Client-side pagination state for Legacy endpoints
    const [allLegacyData, setAllLegacyData] = useState<any[]>([]);
    const [legacyPage, setLegacyPage] = useState(0);
    const ROWS_PER_PAGE = 50;

    // Sheet state
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // Tab state: 'browser' or 'sync'
    const [activeTab, setActiveTab] = useState<'browser' | 'sync'>('browser');

    // Dynamic Columns Helper
    const getDynamicColumns = () => {
        if (data.length === 0) return [];
        const keys = new Set<string>();
        // Sample first 5 items to get keys
        data.slice(0, 5).forEach(item => {
            Object.keys(item).forEach(k => keys.add(k));
        });
        return Array.from(keys);
    };

    const columns = getDynamicColumns();

    // Export state
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    // ... imports need to be added at top, but I can't do that easily with replace here. 
    // I'll assume I can add imports in a separate REPLACE block or at the top if I could.
    // Wait, I should add imports first. 

    // I will add the logic helper function here.

    const handleExport = async () => {
        setIsExporting(true);
        setExportProgress(0);

        try {
            const XLSX = await import("xlsx");
            let allExportData: any[] = [];
            let currentCursor: string | null = null;
            let keepFetching = true;
            let pageCount = 0;

            // Initial fetch params
            const baseQuery = new URLSearchParams({
                year,
                limit: '100', // Fetch in larger chunks for export
            });
            if (search) {
                baseQuery.set('search', search);
            }

            while (keepFetching) {
                const query = new URLSearchParams(baseQuery);
                if (currentCursor) {
                    query.set('cursor', currentCursor);
                }

                const res = await fetch(`/api/inaproc?${query.toString()}`);
                if (!res.ok) throw new Error("Failed to fetch data for export");

                const result = await res.json();
                const pageData = result.data || [];

                if (pageData.length === 0) {
                    keepFetching = false;
                } else {
                    allExportData = [...allExportData, ...pageData];
                    setExportProgress(allExportData.length);

                    // Check cursor
                    const nextCursor = result.cursor || (result.meta && result.meta.cursor);
                    if (nextCursor && result.has_more !== false) {
                        currentCursor = nextCursor;
                    } else {
                        keepFetching = false;
                    }
                }

                // Safety break to prevent infinite loops during dev (remove or increase limit for prod)
                if (pageCount > 100) break;
                pageCount++;

                // Small delay to be nice to API
                await new Promise(r => setTimeout(r, 200));
            }

            // Create Excel
            const worksheet = XLSX.utils.json_to_sheet(allExportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, `Data ${year}`);

            // Generate filename
            const filename = `INAPROC_Data_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(workbook, filename);

        } catch (error) {
            console.error("Export failed:", error);
            alert("Export failed. See console for details.");
        } finally {
            setIsExporting(false);
        }
    };

    // Stats
    const [stats, setStats] = useState({ totalItems: 0, totalPagu: 0 });

    const fetchData = async (reset = false, nextCursor: string | null = null) => {
        // Check if endpoint is restricted
        const currentEp = ENDPOINTS.find(ep => ep.value === selectedEndpoint);
        if (currentEp?.requiresId) {
            setLoading(false);
            setData([]); // Clear data
            return;
        }

        // Client-side pagination logic for Legacy
        if (!reset && nextCursor === 'CLIENT_SIDE' && allLegacyData.length > 0) {
            const nextPage = legacyPage + 1;
            const start = nextPage * ROWS_PER_PAGE;
            const end = start + ROWS_PER_PAGE;
            const nextChunk = allLegacyData.slice(start, end);

            setData(prev => [...prev, ...nextChunk]);
            setLegacyPage(nextPage);
            setHasMore(end < allLegacyData.length);
            return;
        }

        setLoading(true);
        try {
            const query = new URLSearchParams({
                year,
                limit: '50',
                endpoint: selectedEndpoint,
            });
            if (nextCursor && nextCursor !== 'CLIENT_SIDE') {
                query.set('cursor', nextCursor);
            }
            if (search) {
                query.set('search', search);
            }

            const res = await fetch(`/api/inaproc?${query.toString()}`);
            const result = await res.json();

            if (result.data) {
                if (reset) {
                    // Check if it's a large legacy response (array without server pagination)
                    // My normalized legacy API returns { data: [...], meta: { total: N }, has_more: false }
                    const isLegacyLarge = result.meta?.total > ROWS_PER_PAGE && result.has_more === false;

                    if (isLegacyLarge) {
                        // Store massive dataset in memory and paginate locally
                        setAllLegacyData(result.data);
                        setData(result.data.slice(0, ROWS_PER_PAGE));
                        setLegacyPage(0);
                        setHasMore(true);
                        setCursor('CLIENT_SIDE');
                    } else {
                        // Standard V1 or small legacy
                        setAllLegacyData([]);
                        setData(result.data);
                        const newCursor = result.cursor || (result.meta && result.meta.cursor);
                        setCursor(newCursor);
                        setHasMore(!!newCursor);
                    }
                } else {
                    setData(prev => {
                        return [...prev, ...result.data];
                    });

                    const newCursor = result.cursor || (result.meta && result.meta.cursor);
                    setCursor(newCursor);
                    setHasMore(!!newCursor);
                }
            } else {
                if (reset) setData([]);
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setCursor(null);
        setHasMore(false);
        setData([]);
        fetchData(true);
    }, [year, selectedEndpoint]);

    // Calculate stats based on CURRENT loaded data (simple approach) or formatted
    // Ideally, stats come from API for "Total", but we'll sum up what we have.
    useEffect(() => {
        const priceKeys = ['total_harga', 'pagu', 'nilai_kontrak', 'nilai_pagu_paket', 'total_pagu'];
        const totalPagu = data.reduce((acc, item) => {
            for (const key of priceKeys) {
                if (item[key]) {
                    return acc + (parseFloat(item[key]) || 0);
                }
            }
            return acc;
        }, 0);

        // If client-side pagination is active, show the TOTAL records, not just rendered ones
        const totalCount = allLegacyData.length > 0 ? allLegacyData.length : data.length;
        setStats({ totalItems: totalCount, totalPagu });
    }, [data, allLegacyData]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchData(true);
    };

    const loadMore = () => {
        if (cursor) {
            fetchData(false, cursor);
        }
    };

    const openDetails = (item: any) => {
        setSelectedItem(item);
        setIsSheetOpen(true);
    };

    // Helper to format currency
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);
    };

    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans">
            {/* Detail Sheet Component */}
            <DetailSheet
                open={isSheetOpen}
                onOpenChange={setIsSheetOpen}
                data={selectedItem}
            />

            {/* Header / Hero */}
            <header className="sticky top-0 z-40 w-full border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-blue-600 dark:text-blue-400">
                        <Database className="h-6 w-6" />
                        <span>INAPROC Visualizer</span>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Year Selector */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium hidden sm:inline-block text-slate-500">Tahun:</span>
                            <Select value={year} onValueChange={setYear}>
                                <SelectTrigger className="w-[100px] h-9">
                                    <SelectValue placeholder="Year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 2026 - 2018 + 1 }, (_, i) => 2026 - i).map((y) => (
                                        <SelectItem key={y} value={String(y)}>
                                            {y}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 md:px-6 py-8 space-y-8">

                {/* Stats Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-white dark:bg-slate-900 border-none shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500">Total Data Loaded</CardTitle>
                            <Database className="h-4 w-4 text-slate-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalItems.toLocaleString()}</div>
                            <p className="text-xs text-slate-500">Rows fetched so far</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-white dark:bg-slate-900 border-none shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500">Total Pagu (Loaded)</CardTitle>
                            <DollarSign className="h-4 w-4 text-emerald-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold truncate" title={formatCurrency(stats.totalPagu)}>
                                {formatCurrency(stats.totalPagu)}
                            </div>
                            <p className="text-xs text-slate-500">Sum of visible pagu</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-none shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-100">Status</CardTitle>
                            <TrendingUp className="h-4 w-4 text-blue-100" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{loading ? 'Syncing...' : 'Active'}</div>
                            <p className="text-xs text-blue-100/70">Connected to INAPROC API</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg shadow-sm border">
                    <Button
                        variant={activeTab === 'browser' ? 'default' : 'ghost'}
                        className={`gap-2 ${activeTab === 'browser' ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                        onClick={() => setActiveTab('browser')}
                    >
                        <TableIcon className="h-4 w-4" />
                        Data Browser
                    </Button>
                    <Button
                        variant={activeTab === 'sync' ? 'default' : 'ghost'}
                        className={`gap-2 ${activeTab === 'sync' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}`}
                        onClick={() => setActiveTab('sync')}
                    >
                        <FolderSync className="h-4 w-4" />
                        Sync Manager
                    </Button>
                </div>

                {/* Sync Manager Tab */}
                {activeTab === 'sync' && (
                    <SyncManager year={year} onSyncComplete={() => fetchData(true)} />
                )}

                {/* Data Browser Tab */}
                {activeTab === 'browser' && (
                    <>
                        {/* Filters & Actions */}
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm border sticky top-16 z-30">
                            <form onSubmit={handleSearch} className="relative w-full md:w-96">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                                <Input
                                    placeholder="Search packages..."
                                    className="pl-9 bg-slate-50 dark:bg-slate-950 border-none focus-visible:ring-1"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </form>
                            <div className="flex gap-2 w-full md:w-auto items-center flex-wrap">
                                {/* Endpoint Selector */}
                                <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
                                    <SelectTrigger className="w-[320px] h-10 bg-slate-100 dark:bg-slate-800 border-none font-medium">
                                        <SelectValue placeholder="Select Endpoint" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[400px]">
                                        <SelectGroup>
                                            <SelectLabel className="text-blue-600 font-semibold flex items-center gap-2">
                                                📦 V1 Endpoints
                                            </SelectLabel>
                                            {ENDPOINTS.filter(ep => ep.type === 'v1').map((ep) => (
                                                <SelectItem key={ep.value} value={ep.value}>
                                                    {ep.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                        <SelectGroup>
                                            <SelectLabel className="text-amber-600 font-semibold flex items-center gap-2 pt-2">
                                                📜 Legacy Endpoints
                                            </SelectLabel>
                                            {ENDPOINTS.filter(ep => ep.type === 'legacy').map((ep) => (
                                                <SelectItem key={ep.value} value={ep.value}>
                                                    {ep.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>

                                {ENDPOINTS.find(ep => ep.value === selectedEndpoint)?.requiresId && (
                                    <div className="text-xs text-amber-600 font-medium flex items-center gap-1 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                        <AlertTriangle className="h-3 w-3" />
                                        Requires Specific ID
                                    </div>
                                )}

                                <Button variant="outline" className="gap-2" onClick={() => fetchData(true)} disabled={loading || isExporting}>
                                    <Filter className="h-4 w-4" />
                                    Reset / Refresh
                                </Button>
                                <Button
                                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={handleExport}
                                    disabled={loading || isExporting}
                                >
                                    {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                    {isExporting ? `Exporting (${exportProgress})...` : 'Export to Excel'}
                                </Button>
                            </div>
                        </div>

                        {/* Enhanced Data Table */}
                        {ENDPOINTS.find(ep => ep.value === selectedEndpoint)?.requiresId ? (
                            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-8 flex flex-col items-center justify-center text-center gap-3 text-amber-800 dark:text-amber-200 mt-4">
                                <AlertTriangle className="h-10 w-10 opacity-80" />
                                <div>
                                    <h4 className="font-semibold text-lg">Restricted Endpoint</h4>
                                    <p className="max-w-md mx-auto mt-1 text-amber-700 dark:text-amber-300">
                                        This endpoint ("{ENDPOINTS.find(ep => ep.value === selectedEndpoint)?.label}") requires specific parameters (like ID) to fetch data.
                                        It cannot be browsed directly without a specific ID context.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <Card className="bg-white dark:bg-slate-900 shadow-sm border-none overflow-hidden flex flex-col h-[600px] relative z-0">
                                <CardHeader className="border-b bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
                                    <CardTitle>{ENDPOINTS.find(ep => ep.value === selectedEndpoint)?.label || 'Data Paket'}</CardTitle>
                                    <CardDescription>Archive data from INAPROC API. Click row or eye icon for details.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0 flex-1 overflow-hidden relative">
                                    <div className="absolute inset-0 overflow-auto">

                                        <table data-slot="table" className="caption-bottom text-sm w-max min-w-full">
                                            <TableHeader className="sticky top-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
                                                <TableRow className="bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50/50">
                                                    <TableHead className="w-[50px] whitespace-nowrap">No</TableHead>
                                                    {columns.map(key => (
                                                        <TableHead key={key} className="whitespace-nowrap capitalize font-semibold text-slate-700 dark:text-slate-300">
                                                            {key.replace(/_/g, ' ')}
                                                        </TableHead>
                                                    ))}
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {data.length === 0 && !loading ? (
                                                    <TableRow>
                                                        <TableCell colSpan={columns.length + 2} className="h-24 text-center text-slate-500">
                                                            No data found.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    data.map((item, index) => (
                                                        <TableRow
                                                            key={index}
                                                            className="hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer group border-b border-slate-100 dark:border-slate-800"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openDetails(item);
                                                            }}
                                                        >
                                                            <TableCell className="font-medium text-slate-500 text-xs">{index + 1}</TableCell>
                                                            {columns.map(key => {
                                                                const val = item[key];
                                                                let displayVal: React.ReactNode = val;

                                                                if (val === null || val === undefined) displayVal = <span className="text-slate-300">-</span>;
                                                                else if (typeof val === 'number' && (key.includes('harga') || key.includes('pagu') || key.includes('nilai') || key.includes('ongkos'))) {
                                                                    displayVal = <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(val)}</span>;
                                                                } else if (typeof val === 'string' && (key.includes('tanggal') || val.match(/^\d{4}-\d{2}-\d{2}/))) {
                                                                    try {
                                                                        displayVal = new Date(val).toLocaleDateString();
                                                                    } catch (e) { displayVal = val; }
                                                                } else if (typeof val === 'object') {
                                                                    displayVal = <span className="italic text-xs text-slate-400">Object</span>;
                                                                } else if (key.includes("status")) {
                                                                    displayVal = <Badge variant="secondary" className="text-[10px] h-5">{String(val)}</Badge>
                                                                }

                                                                return (
                                                                    <TableCell key={key} className="whitespace-nowrap text-xs max-w-[300px] truncate" title={String(val)}>
                                                                        {displayVal}
                                                                    </TableCell>
                                                                )
                                                            })}
                                                            <TableCell>
                                                                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8">
                                                                    <Eye className="h-4 w-4 text-blue-600" />
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </table>
                                    </div>
                                </CardContent>
                                {
                                    (hasMore || loading) && (
                                        <div className="p-4 border-t flex justify-center bg-slate-50/30 shrink-0 relative z-20">
                                            <Button
                                                variant="ghost"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    loadMore();
                                                }}
                                                disabled={loading}
                                                className="w-full max-w-xs gap-2"
                                            >
                                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                                {loading ? 'Loading more...' : 'Load More Data'}
                                            </Button>
                                        </div>
                                    )
                                }
                            </Card>
                        )}
                    </>
                )}

            </main >
        </div >
    );
}

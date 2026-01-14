
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: any | null;
}

export function DetailSheet({ open, onOpenChange, data }: DetailSheetProps) {
    if (!data) return null;

    // Helper to format currency
    const formatCurrency = (val: any) => {
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(num);
    };

    // Helper to format date
    const formatDate = (val: string) => {
        try {
            return new Date(val).toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return val;
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl font-bold leading-relaxed text-blue-700 dark:text-blue-400">
                        {data.nama_paket}
                    </SheetTitle>
                    <SheetDescription>
                        Detail lengkap paket pengadaan.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-6">
                    {/* Key Information Card */}
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Kode RUP</p>
                                <p className="font-mono text-sm">{data.kode_rup}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Pagu</p>
                                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(data.pagu)}
                                </p>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase">Instansi / Satker</p>
                            <p className="text-sm font-medium">{data.nama_klpd}</p>
                            <p className="text-xs text-slate-500">{data.nama_satker}</p>
                        </div>
                    </div>

                    {/* All Fields List */}
                    <div>
                        <h3 className="text-sm font-semibold mb-3 border-b pb-1">Semua Data (Raw)</h3>
                        <ScrollArea className="h-[400px] rounded-md border p-4 bg-slate-50 dark:bg-slate-950/50">
                            <div className="grid grid-cols-1 gap-2 text-sm">
                                {Object.entries(data).map(([key, value]) => {
                                    // Skip objects/arrays for simple display or JSON stringify them
                                    let displayValue = value;
                                    if (typeof value === 'object' && value !== null) {
                                        displayValue = JSON.stringify(value);
                                    }
                                    // Format specific keys if needed
                                    if (key.includes('pagu') || key.includes('harga')) {
                                        displayValue = formatCurrency(value);
                                    }
                                    if (key.includes('tanggal') || key.includes('waktu')) {
                                        displayValue = formatDate(value as string);
                                    }

                                    return (
                                        <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                            <span className="font-medium text-slate-500 truncate" title={key}>{key}</span>
                                            <span className="sm:col-span-2 text-slate-900 dark:text-slate-200 break-words font-mono text-xs sm:text-sm">
                                                {String(displayValue)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

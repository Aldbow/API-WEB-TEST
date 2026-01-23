
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
        } catch {
            return val;
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[600px] border-l border-border/50 bg-background/80 backdrop-blur-xl p-0 flex flex-col gap-0">
                <div className="p-6 border-b border-border/50 bg-secondary/20">
                    <SheetHeader>
                        <SheetTitle className="text-xl font-bold leading-relaxed text-primary">
                            {data.nama_paket}
                        </SheetTitle>
                        <SheetDescription className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="bg-background/50 backdrop-blur-sm border-primary/20 text-primary">
                                {data.kode_rup || 'N/A'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{data.sumber_dana || 'Sumber Dana N/A'}</span>
                        </SheetDescription>
                    </SheetHeader>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    <ScrollArea className="h-full w-full">
                        <div className="p-6 space-y-8">
                            {/* Key Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-card border shadow-sm space-y-1">
                                    <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Pagu Anggaran</p>
                                    <p className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(data.pagu)}
                                    </p>
                                </div>
                                <div className="p-4 rounded-xl bg-card border shadow-sm space-y-1">
                                    <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">HPS</p>
                                    <p className="font-mono text-lg font-semibold text-blue-600 dark:text-blue-400">
                                        {data.total_harga ? formatCurrency(data.total_harga) : '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Organization Info */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold border-l-2 border-primary pl-2">Informasi Instansi</h3>
                                <div className="grid gap-3 text-sm">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 pb-2 border-b border-border/50 last:border-0 md:items-center">
                                        <span className="font-medium text-muted-foreground">KLPD</span>
                                        <span className="col-span-2">{data.nama_klpd}</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 pb-2 border-b border-border/50 last:border-0 md:items-center">
                                        <span className="font-medium text-muted-foreground">Satuan Kerja</span>
                                        <span className="col-span-2">{data.nama_satker}</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 pb-2 border-b border-border/50 last:border-0 md:items-center">
                                        <span className="font-medium text-muted-foreground">Lokasi</span>
                                        <span className="col-span-2">{data.lokasi_pekerjaan || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            <Separator className="bg-border/50" />

                            {/* Raw Data */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold border-l-2 border-primary pl-2">Data Lengkap</h3>
                                <div className="space-y-2 text-sm bg-secondary/20 p-4 rounded-xl border border-border/50">
                                    {Object.entries(data).map(([key, value]) => {
                                        if (['nama_paket', 'pagu', 'kode_rup', 'nama_klpd', 'nama_satker'].includes(key)) return null;

                                        let displayValue = value;
                                        if (typeof value === 'object' && value !== null) {
                                            displayValue = JSON.stringify(value);
                                        }
                                        if (key.includes('pagu') || key.includes('harga')) {
                                            displayValue = formatCurrency(value);
                                        }
                                        if (key.includes('tanggal') || key.includes('waktu')) {
                                            displayValue = formatDate(value as string);
                                        }

                                        return (
                                            <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 py-1.5 border-b border-border/30 last:border-0 text-xs sm:text-sm">
                                                <span className="font-medium text-muted-foreground truncate" title={key}>
                                                    {key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                                </span>
                                                <span className="sm:col-span-2 font-mono break-all opacity-90">
                                                    {String(displayValue)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </SheetContent>
        </Sheet>
    );
}

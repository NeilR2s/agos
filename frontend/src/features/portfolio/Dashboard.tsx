import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { backendClient, getUserId } from "@/api/backend/client";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { TerminalSkeleton } from "@/components/ui/terminal-skeleton";
import { TickerAutocompleteInput } from "@/components/shared/TickerAutocomplete";
import { normalizeMarketOverview } from "@/data/normalizeMarket";
import { cn } from "@/lib/utils";
import {
    extractErrorMessage,
    formatCurrency,
    formatNumber,
    formatPercent,
    formatSignedNumber,
} from "@/lib/format";
import { normalizePortfolio, normalizeCash } from "@/data/normalizePortfolio";
import { toast } from "sonner";
import { PencilLine, Trash2 } from "lucide-react";

type HoldingRow = {
    id: string;
    userId: string;
    ticker: string;
    shares: number;
    avgPrice: number;
    currentPrice?: number | null;
    marketValue?: number | null;
    gainLoss?: number | null;
    gainLossPercent?: number | null;
};

type HoldingDialogState = {
    mode: "add";
    draftTicker?: string;
} | {
    mode: "edit";
    holding: HoldingRow;
} | null;

// Portfolio normalization moved to src/data/normalizePortfolio

export const Dashboard = () => {
    const userId = getUserId();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [holdingDialog, setHoldingDialog] = useState<HoldingDialogState>(null);
    const [cashOpen, setCashOpen] = useState(false);
    const [tickerToDelete, setTickerToDelete] = useState<string | null>(null);
    const addTickerParam = searchParams.get("add")?.toUpperCase() ?? null;
    const activeHoldingDialog: HoldingDialogState = holdingDialog ?? (addTickerParam ? { mode: "add", draftTicker: addTickerParam } : null);

    const portfolioQuery = useQuery({
        queryKey: ["portfolio", userId],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/portfolio/{user_id}", {
                params: { path: { user_id: userId } },
            });

            if (error) throw error;
            return normalizePortfolio(data);
        },
        refetchInterval: 10000,
        staleTime: 5000,
    });

    const cashQuery = useQuery({
        queryKey: ["portfolio-cash", userId],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/portfolio/{user_id}/cash", {
                params: { path: { user_id: userId } },
            });

            if (error) throw error;
            return normalizeCash(data);
        },
        refetchInterval: 10000,
    });

    const invalidatePortfolio = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["portfolio", userId] }),
            queryClient.invalidateQueries({ queryKey: ["portfolio-cash", userId] }),
        ]);
    };

    const addHoldingMutation = useMutation({
        mutationFn: async (payload: { ticker: string; shares: number; avgPrice: number }) => {
            const { data, error } = await backendClient.POST("/api/v1/portfolio/{user_id}/holdings", {
                params: { path: { user_id: userId } },
                body: payload,
            });

            if (error) throw error;
            return data;
        },
        onSuccess: async () => {
            await invalidatePortfolio();
            if (addTickerParam) {
                const next = new URLSearchParams(searchParams);
                next.delete("add");
                setSearchParams(next, { replace: true });
            }
            setHoldingDialog(null);
            toast.success("Holding added");
        },
        onError: (error) => {
            toast.error(`Add failed: ${extractErrorMessage(error)}`);
        },
    });

    const updateHoldingMutation = useMutation({
        mutationFn: async (payload: { ticker: string; shares?: number; avgPrice?: number }) => {
            const { ticker, ...body } = payload;
            const { data, error } = await backendClient.PUT("/api/v1/portfolio/{user_id}/holdings/{ticker}", {
                params: { path: { user_id: userId, ticker } },
                body,
            });

            if (error) throw error;
            return data;
        },
        onSuccess: async () => {
            await invalidatePortfolio();
            setHoldingDialog(null);
            toast.success("Holding updated");
        },
        onError: (error) => {
            toast.error(`Update failed: ${extractErrorMessage(error)}`);
        },
    });

    const deleteHoldingMutation = useMutation({
        mutationFn: async (ticker: string) => {
            const { data, error } = await backendClient.DELETE("/api/v1/portfolio/{user_id}/holdings/{ticker}", {
                params: { path: { user_id: userId, ticker } },
            });

            if (error) throw error;
            return data;
        },
        onSuccess: async () => {
            await invalidatePortfolio();
            toast.success("Holding deleted");
        },
        onError: (error) => {
            toast.error(`Delete failed: ${extractErrorMessage(error)}`);
        },
    });

    const updateCashMutation = useMutation({
        mutationFn: async (amount: number) => {
            const { data, error } = await backendClient.PUT("/api/v1/portfolio/{user_id}/cash", {
                params: { path: { user_id: userId } },
                body: { amount },
            });

            if (error) throw error;
            return data;
        },
        onSuccess: async () => {
            await invalidatePortfolio();
            setCashOpen(false);
            toast.success("Cash updated");
        },
        onError: (error) => {
            toast.error(`Cash update failed: ${extractErrorMessage(error)}`);
        },
    });

    const portfolio = portfolioQuery.data;
    const cashAmount = cashQuery.data?.amount ?? portfolio?.liquidCash ?? 0;
    const [showAllocation, setShowAllocation] = useState(false);

    const handleExportCsv = () => {
        if (!portfolio) return;

        const headers = ["Ticker", "Shares", "Average Price", "Last Price", "Market Value", "Gain/Loss", "Return (%)"];
        const rows = portfolio.holdings.map((h) => [
            h.ticker,
            h.shares,
            h.avgPrice,
            h.currentPrice ?? 0,
            h.marketValue ?? 0,
            h.gainLoss ?? 0,
            h.gainLossPercent !== null ? h.gainLossPercent.toFixed(2) : "0.00"
        ]);

        rows.push(["CASH", "", "", "", cashAmount, "", ""]);
        rows.push([
            "TOTAL PORTFOLIO",
            "",
            "",
            "",
            portfolio.totalPortfolioValue,
            portfolio.totalGainLoss ?? 0,
            portfolio.totalGainLossPercent !== null ? portfolio.totalGainLossPercent.toFixed(2) : "0.00"
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((r) => r.map(String).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `AGOS_Portfolio_${new Date().toISOString().split("T")[0]}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Portfolio exported to CSV");
    };

    const allocationSegments = [
        ...(portfolio?.holdings ?? [])
            .map((holding) => ({
                label: holding.ticker,
                value: Math.max(holding.marketValue ?? 0, 0),
                sublabel: `${formatNumber(holding.shares, "en-PH", 0)} shares`,
            }))
            .filter((segment) => segment.value > 0)
            .sort((left, right) => right.value - left.value),
        ...(cashAmount > 0
            ? [{ label: "Cash", value: cashAmount, sublabel: "Liquid capital" }]
            : []),
    ];
    const allocationTotal = allocationSegments.reduce((sum, segment) => sum + segment.value, 0);

    const allocationPalette = [
        "var(--foreground)",
        "color-mix(in oklch, var(--foreground) 78%, transparent)",
        "color-mix(in oklch, var(--foreground) 62%, transparent)",
        "color-mix(in oklch, var(--foreground) 46%, transparent)",
        "color-mix(in oklch, var(--foreground) 30%, transparent)",
        "var(--chart-2)",
        "var(--chart-1)",
        "var(--destructive)",
    ];

    const gainClass = (value: number) =>
        value > 0 ? "text-chart-2" : value < 0 ? "text-destructive" : "text-muted-foreground";

    const portfolioError = portfolioQuery.error ? extractErrorMessage(portfolioQuery.error) : null;

    return (
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-[32px] px-6 py-8 md:px-8 md:py-12">
            <header className="flex flex-col gap-4 border-b border-border/50 pb-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-3">
                    <h1 className="font-sans text-[28px] font-medium leading-[1.2]">Portfolio</h1>
                    <p className="max-w-[700px] font-sans text-[15px] leading-[1.5] text-muted-foreground">
                        Track holdings, exposure, and performance.
                    </p>
                </div>
                <div className="flex flex-col items-start gap-3 md:items-end">
                    <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" className="text-muted-foreground" onClick={() => setShowAllocation(!showAllocation)}>
                            {showAllocation ? "Hide Allocation" : "Allocation"}
                        </Button>
                        <Button variant="outline" onClick={() => setHoldingDialog({ mode: "add" })}>
                            Add Holding
                        </Button>
                        <Button variant="ghost" className="text-muted-foreground" onClick={() => setCashOpen(true)}>
                            Sync Cash
                        </Button>
                        <Button
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={handleExportCsv}
                            disabled={portfolioQuery.isLoading}
                        >
                            Export
                        </Button>
                    </div>
                </div>
            </header>

            {portfolioError ? (
                <div className="rounded-2xl border border-border bg-card px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                    Portfolio error: {portfolioError}
                </div>
            ) : null}

            <section className="flex flex-wrap items-center gap-x-12 gap-y-6">
                <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Net Value</p>
                    <p className="font-mono text-xl tabular-nums text-foreground">{formatCurrency(portfolio?.totalPortfolioValue)}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Cash</p>
                    <p className="font-mono text-xl tabular-nums text-foreground">{formatCurrency(cashAmount)}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">P/L</p>
                    <p className={cn("font-mono text-xl tabular-nums", gainClass(portfolio?.totalGainLoss ?? 0))}>{formatSignedNumber(portfolio?.totalGainLoss)}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Return</p>
                    <p className={cn("font-mono text-xl tabular-nums", gainClass(portfolio?.totalGainLossPercent ?? 0))}>{formatPercent(portfolio?.totalGainLossPercent)}</p>
                </div>
                <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Holdings</p>
                    <p className="font-mono text-xl tabular-nums text-foreground">{portfolio?.holdings.length ?? 0}</p>
                </div>
            </section>

            {showAllocation && allocationTotal > 0 && (
                <section className="space-y-3 animate-in fade-in duration-500">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        {allocationSegments.map((segment, index) => (
                            <div
                                key={segment.label}
                                className="h-full transition-all"
                                style={{
                                    width: `${(segment.value / allocationTotal) * 100}%`,
                                    backgroundColor: allocationPalette[index % allocationPalette.length],
                                }}
                                title={`${segment.label} ${((segment.value / allocationTotal) * 100).toFixed(1)}%`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        {allocationSegments.map((segment, index) => (
                            <div key={segment.label} className="flex items-center gap-2">
                                <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: allocationPalette[index % allocationPalette.length] }}
                                />
                                <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                                    {segment.label} <span className="text-foreground ml-1">{((segment.value / allocationTotal) * 100).toFixed(1)}%</span>
                                    <span className="ml-1 opacity-50">({formatCurrency(segment.value)})</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {portfolio?.totalGainLoss === null ? (
                <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                    Gain and loss are unavailable for one or more holdings until a valid average price is saved.
                </div>
            ) : null}

            <section className="mt-[24px]">
                <h2 className="mb-4 font-sans text-[16px] font-medium">Portfolio Holdings</h2>
                <div className="min-h-[320px]">
                            {portfolioQuery.isLoading ? (
                                <TerminalSkeleton lines={5} label="SYNCING HOLDINGS" />
                            ) : (
                                <Table className="w-full">
                                    <TableHeader>
                                        <TableRow className="border-b border-border/50 hover:bg-transparent">
                                            <TableHead className="w-[88px] h-10 px-0 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Ticker</TableHead>
                                            <TableHead className="w-[76px] h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Shares</TableHead>
                                            <TableHead className="h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Avg Price</TableHead>
                                            <TableHead className="h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Last Price</TableHead>
                                            <TableHead className="h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Market Value</TableHead>
                                            <TableHead className="h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">P/L</TableHead>
                                            <TableHead className="h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Return</TableHead>
                                            <TableHead className="w-[72px] h-10 px-0 text-right font-mono text-[10px] uppercase tracking-[1.4px] text-transparent">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {portfolio?.holdings.map((holding) => (
                                            <TableRow key={holding.id} className="group border-b border-border/50 hover:bg-white/[0.02]">
                                                <TableCell className="px-0 font-mono text-sm uppercase tracking-[1.4px] text-foreground">{holding.ticker}</TableCell>
                                                <TableCell className="px-0 text-right font-mono text-sm tabular-nums text-foreground">{formatNumber(holding.shares, "en-PH", 0)}</TableCell>
                                                <TableCell className="px-0 text-right font-mono text-sm tabular-nums text-foreground">{formatCurrency(holding.avgPrice)}</TableCell>
                                                <TableCell className="px-0 text-right font-mono text-sm tabular-nums text-foreground">{formatCurrency(holding.currentPrice)}</TableCell>
                                                <TableCell className="px-0 text-right font-mono text-sm tabular-nums text-foreground">{formatCurrency(holding.marketValue)}</TableCell>
                                                <TableCell className={cn("px-0 text-right font-mono text-sm tabular-nums", gainClass(holding.gainLoss ?? 0))}>{formatSignedNumber(holding.gainLoss)}</TableCell>
                                                <TableCell className={cn("px-0 text-right font-mono text-sm tabular-nums", gainClass(holding.gainLossPercent ?? 0))}>{holding.gainLossPercent === null ? "---" : formatPercent(holding.gainLossPercent)}</TableCell>
                                                <TableCell className="px-0">
                                                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            className="text-white/30 hover:bg-white/5 hover:text-white"
                                                            onClick={() => setHoldingDialog({ mode: "edit", holding })}
                                                        >
                                                            <PencilLine className="size-4" />
                                                            <span className="sr-only">Edit {holding.ticker}</span>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            className="text-white/30 hover:bg-white/5 hover:text-white"
                                                            onClick={() => {
                                                                setTickerToDelete(holding.ticker);
                                                            }}
                                                            disabled={deleteHoldingMutation.isPending}
                                                        >
                                                            <Trash2 className="size-4" />
                                                            <span className="sr-only">Delete {holding.ticker}</span>
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {portfolio?.holdings.length === 0 && (
                                            <TableRow className="border-b-0 hover:bg-transparent">
                                                <TableCell colSpan={8} className="py-10 text-center font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                                                    No active positions found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
            </section>

            <HoldingDialog
                key={activeHoldingDialog ? `${activeHoldingDialog.mode}-${activeHoldingDialog.mode === "edit" ? activeHoldingDialog.holding.id : activeHoldingDialog.draftTicker ?? "new"}` : "holding-closed"}
                open={Boolean(activeHoldingDialog)}
                mode={activeHoldingDialog?.mode ?? "add"}
                holding={activeHoldingDialog?.mode === "edit" ? activeHoldingDialog.holding : undefined}
                draftTicker={activeHoldingDialog?.mode === "add" ? activeHoldingDialog.draftTicker : undefined}
                onOpenChange={(open) => {
                    if (!open) {
                        setHoldingDialog(null);

                        if (activeHoldingDialog?.mode === "add" && addTickerParam) {
                            const next = new URLSearchParams(searchParams);
                            next.delete("add");
                            setSearchParams(next, { replace: true });
                        }
                    }
                }}
                onSubmit={(values) => {
                    if (activeHoldingDialog?.mode === "edit") {
                        updateHoldingMutation.mutate(values);
                        return;
                    }

                    addHoldingMutation.mutate(values as { ticker: string; shares: number; avgPrice: number });
                }}
                pending={addHoldingMutation.isPending || updateHoldingMutation.isPending}
            />

            <CashDialog
                key={cashOpen ? "cash-open" : "cash-closed"}
                open={cashOpen}
                onOpenChange={setCashOpen}
                initialAmount={cashAmount}
                onSubmit={(amount) => updateCashMutation.mutate(amount)}
                pending={updateCashMutation.isPending}
            />

            <AlertDialog open={Boolean(tickerToDelete)} onOpenChange={(open) => !open && setTickerToDelete(null)}>
                <AlertDialogContent className="border-border/50 bg-background text-foreground shadow-none sm:max-w-[420px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Holding</AlertDialogTitle>
                        <AlertDialogDescription className="font-sans text-[14px]">
                            Confirm deletion of <span className="font-mono text-white">{tickerToDelete}</span> from the active portfolio. This operation is API-bound and cannot be reversed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3 pt-2">
                        <AlertDialogCancel className="border-transparent hover:bg-white/5">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (tickerToDelete) {
                                    deleteHoldingMutation.mutate(tickerToDelete);
                                    setTickerToDelete(null);
                                }
                            }}
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            Delete Position
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

function HoldingDialog({
    open,
    mode,
    holding,
    draftTicker,
    onOpenChange,
    onSubmit,
    pending,
}: {
    open: boolean;
    mode: "add" | "edit";
    holding?: HoldingRow;
    draftTicker?: string;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: { ticker: string; shares: number; avgPrice: number }) => void;
    pending: boolean;
}) {
    const [ticker, setTicker] = useState(mode === "add" ? draftTicker ?? "" : holding?.ticker ?? "");
    const [shares, setShares] = useState(String(holding?.shares ?? 0));
    const [avgPriceInput, setAvgPriceInput] = useState(mode === "edit" && (holding?.avgPrice ?? 0) > 0 ? String(holding?.avgPrice ?? "") : "");
    const [avgPriceEdited, setAvgPriceEdited] = useState(mode === "edit" && (holding?.avgPrice ?? 0) > 0);
    const normalizedTicker = ticker.trim().toUpperCase();
    const latestPriceQuery = useQuery({
        queryKey: ["holding-market-price", normalizedTicker],
        enabled: open && Boolean(normalizedTicker),
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/market/{ticker}", {
                params: { path: { ticker: normalizedTicker } },
            });

            if (error) throw error;
            return normalizeMarketOverview(data)?.price ?? null;
        },
        staleTime: 60_000,
    });
    const latestKnownPrice = latestPriceQuery.data ?? holding?.currentPrice ?? null;
    const avgPrice = avgPriceEdited
        ? avgPriceInput
        : latestKnownPrice !== null && latestKnownPrice !== undefined && latestKnownPrice > 0
            ? latestKnownPrice.toFixed(2)
            : avgPriceInput;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-border/50 bg-background text-foreground shadow-none sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{mode === "add" ? "Add Holding" : "Edit Holding"}</DialogTitle>
                    <DialogDescription className="font-sans text-[14px]">
                        {mode === "add"
                            ? "Create a new portfolio position."
                            : "Edit position details and refresh market data."}
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-5 mt-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const nextShares = Number(shares);
                        const nextAvgPrice = Number(avgPrice);

                        if (!normalizedTicker) {
                            toast.error("Ticker is required.");
                            return;
                        }

                        if (!Number.isFinite(nextShares) || !Number.isFinite(nextAvgPrice)) {
                            toast.error("Shares and average price must be valid numbers.");
                            return;
                        }

                        if (nextAvgPrice <= 0) {
                            toast.error("Average price must be greater than zero.");
                            return;
                        }

                        onSubmit({
                            ticker: normalizedTicker,
                            shares: nextShares,
                            avgPrice: nextAvgPrice,
                        });
                    }}
                >
                    <div className="space-y-1">
                        <label htmlFor="holding-ticker" className="font-sans text-[13px] font-medium text-white/70">Ticker</label>
                        <TickerAutocompleteInput
                            id="holding-ticker"
                            name="ticker"
                            ariaLabel="Holding ticker"
                            value={ticker}
                            onChange={setTicker}
                            readOnly={mode === "edit"}
                            inputClassName={cn(mode === "edit" ? "text-white/70" : "text-white")}
                            placeholder="TEL"
                            showHint={false}
                        />
                        {mode === "add" && <p className="font-sans text-[11px] text-white/40">Press Enter to select a ticker.</p>}
                    </div>

                    <div className="space-y-1">
                        <label htmlFor="holding-shares" className="font-sans text-[13px] font-medium text-white/70">Shares</label>
                        <input
                            id="holding-shares"
                            name="shares"
                            type="number"
                            min="0"
                            step="1"
                            value={shares}
                            onChange={(event) => setShares(event.target.value)}
                            required
                            className="flex h-11 w-full rounded-none border border-border/50 bg-transparent px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-ring focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    <div className="space-y-1">
                        <label htmlFor="holding-average-price" className="font-sans text-[13px] font-medium text-white/70">Average Price</label>
                        <input
                            id="holding-average-price"
                            name="avgPrice"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={avgPrice}
                            onChange={(event) => {
                                setAvgPriceInput(event.target.value);
                                setAvgPriceEdited(true);
                            }}
                            required
                            placeholder={latestKnownPrice !== null && latestKnownPrice !== undefined && latestKnownPrice > 0 ? latestKnownPrice.toFixed(2) : "0.00"}
                            className="flex h-11 w-full rounded-none border border-border/50 bg-transparent px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-ring focus:ring-1 focus:ring-ring"
                        />
                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40 pt-1">
                            {latestPriceQuery.isFetching && !latestKnownPrice
                                ? "Fetching latest market price..."
                                : latestKnownPrice !== null && latestKnownPrice !== undefined && latestKnownPrice > 0
                                    ? `Latest market price ${formatCurrency(latestKnownPrice)}`
                                    : "Latest market price unavailable. Enter your cost basis manually."}
                        </p>
                    </div>

                    <DialogFooter className="gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="default" disabled={pending}>
                            {pending ? "Saving..." : mode === "add" ? "Add Holding" : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function CashDialog({
    open,
    initialAmount,
    onOpenChange,
    onSubmit,
    pending,
}: {
    open: boolean;
    initialAmount: number;
    onOpenChange: (open: boolean) => void;
    onSubmit: (amount: number) => void;
    pending: boolean;
}) {
    const [amount, setAmount] = useState(String(initialAmount));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="border-border/50 bg-background text-foreground shadow-none sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Update Cash</DialogTitle>
                    <DialogDescription className="font-sans text-[14px]">Synchronize cash balance via portfolio endpoint.</DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-5 mt-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const nextAmount = Number(amount);

                        if (!Number.isFinite(nextAmount)) {
                            return;
                        }

                        onSubmit(nextAmount);
                    }}
                >
                    <div className="space-y-1">
                        <label htmlFor="cash-amount" className="font-sans text-[13px] font-medium text-white/70">Amount</label>
                        <input
                            id="cash-amount"
                            name="amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            required
                            className="flex h-11 w-full rounded-none border border-border/50 bg-transparent px-3 py-2 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-ring focus:ring-1 focus:ring-ring"
                        />
                    </div>

                    <DialogFooter className="gap-3 pt-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="default" disabled={pending}>
                            {pending ? "Saving..." : "Update Cash"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

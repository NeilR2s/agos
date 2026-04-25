import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { backendClient, getUserId } from "@/api/backend/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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

const allocationPalette = [
    "rgba(255,255,255,0.92)",
    "rgba(255,255,255,0.75)",
    "rgba(255,255,255,0.58)",
    "rgba(255,255,255,0.44)",
    "rgba(255,255,255,0.32)",
    "rgba(127,157,131,0.8)",
    "rgba(209,185,112,0.78)",
    "rgba(166,123,123,0.76)",
];

export const Dashboard = () => {
    const userId = getUserId();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    const [holdingDialog, setHoldingDialog] = useState<HoldingDialogState>(null);
    const [cashOpen, setCashOpen] = useState(false);
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

    const gainClass = (value: number) =>
        value > 0 ? "text-[#7f9d83]" : value < 0 ? "text-[#a67b7b]" : "text-white/70";

    const portfolioError = portfolioQuery.error ? extractErrorMessage(portfolioQuery.error) : null;

    // Pass 3: Portfolio Risk Exposure Metrics
    const sortedHoldings = [...(portfolio?.holdings ?? [])].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
    const totalVal = portfolio?.totalPortfolioValue ?? 0;
    const largestPos = sortedHoldings[0]?.ticker ?? "None";
    const top3Val = sortedHoldings.slice(0, 3).reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
    const top3Pct = totalVal > 0 ? (top3Val / totalVal) * 100 : 0;
    const cashPct = totalVal > 0 ? (cashAmount / totalVal) * 100 : 0;

    return (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 py-8 md:px-8 md:py-12">
            <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-3">
                    <Badge variant="outline" className="border-border text-white/70">
                        Portfolio
                    </Badge>
                    <h1 className="font-sans text-[30px] leading-[1.2]">Portfolio Control Surface</h1>
                    <p className="max-w-[700px] font-sans text-[16px] leading-[1.5] text-white/70">
                        Manage holdings and cash directly from the dashboard. The live portfolio value, cash balance, and position-level metrics refresh automatically from the backend.
                    </p>
                </div>
                <div className="flex flex-col items-start gap-3 md:items-end">
                    <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={() => setHoldingDialog({ mode: "add" })}>
                            Add Holding
                        </Button>
                    </div>
                </div>
            </header>

            {portfolioError ? (
                <div className="border border-border px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                    Portfolio error: {portfolioError}
                </div>
            ) : null}

            <section className="grid gap-4 md:grid-cols-2">
                <SummaryCard
                    title="Portfolio Summary"
                    actionLabel="Update Cash"
                    onAction={() => setCashOpen(true)}
                    rows={[
                        { label: "Total Portfolio Value", value: formatCurrency(portfolio?.totalPortfolioValue) },
                        {
                            label: "Liquid Cash",
                            value: formatCurrency(cashAmount),
                            subvalue: "Available capital",
                        },
                        { label: "Market Value", value: formatCurrency(portfolio?.totalMarketValue) },
                        {
                            label: "Total Gain / Loss",
                            value: formatSignedNumber(portfolio?.totalGainLoss),
                            valueClassName: gainClass(portfolio?.totalGainLoss ?? 0),
                            subvalue: formatPercent(portfolio?.totalGainLossPercent),
                            subvalueClassName: gainClass(portfolio?.totalGainLossPercent ?? 0),
                        },
                    ]}
                />

                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="text-[18px] leading-[1.2]">Portfolio Snapshot</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <StatRow label="Holdings" value={String(portfolio?.holdings.length ?? 0)} />
                        <StatRow label="Portfolio Value" value={formatCurrency(portfolio?.totalPortfolioValue)} />
                        <StatRow
                            label="Gain / Loss"
                            value={formatSignedNumber(portfolio?.totalGainLoss)}
                            valueClassName={gainClass(portfolio?.totalGainLoss ?? 0)}
                        />
                        <StatRow
                            label="Gain / Loss %"
                            value={formatPercent(portfolio?.totalGainLossPercent)}
                            valueClassName={gainClass(portfolio?.totalGainLossPercent ?? 0)}
                        />
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="text-[14px] uppercase tracking-[1.4px] text-white/50">Largest Position</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-mono text-2xl font-bold text-white">{largestPos}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1px] text-white/30">
                            {sortedHoldings[0] ? `${((sortedHoldings[0].marketValue ?? 0) / totalVal * 100).toFixed(1)}% of portfolio` : "No positions"}
                        </p>
                    </CardContent>
                </Card>

                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="text-[14px] uppercase tracking-[1.4px] text-white/50">Top 3 Concentration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-mono text-2xl font-bold text-white">{top3Pct.toFixed(1)}%</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1px] text-white/30">
                            Combined weight of top holdings
                        </p>
                    </CardContent>
                </Card>

                <Card size="sm">
                    <CardHeader>
                        <CardTitle className="text-[14px] uppercase tracking-[1.4px] text-white/50">Cash Ratio</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="font-mono text-2xl font-bold text-white">{cashPct.toFixed(1)}%</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1px] text-white/30">
                            Liquid capital availability
                        </p>
                    </CardContent>
                </Card>
            </section>

            {portfolio?.totalGainLoss === null ? (
                <div className="border border-dashed border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
                    Gain and loss are unavailable for one or more holdings until a valid average price is saved.
                </div>
            ) : null}

            <section>
                <Card>
                    <CardHeader>
                        <CardTitle>Capital Allocation</CardTitle>
                        <CardDescription>
                            Current capital split across active holdings and cash.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {allocationTotal > 0 ? (
                            <>
                                <div className="flex h-6 overflow-hidden border border-border">
                                    {allocationSegments.map((segment, index) => (
                                        <div
                                            key={segment.label}
                                            className="h-full min-w-[2px]"
                                            style={{
                                                width: `${(segment.value / allocationTotal) * 100}%`,
                                                backgroundColor: allocationPalette[index % allocationPalette.length],
                                            }}
                                            title={`${segment.label} ${((segment.value / allocationTotal) * 100).toFixed(1)}%`}
                                            aria-label={`${segment.label} allocation ${((segment.value / allocationTotal) * 100).toFixed(1)} percent`}
                                        />
                                    ))}
                                </div>

                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {allocationSegments.map((segment, index) => {
                                        const allocationPct = allocationTotal > 0 ? (segment.value / allocationTotal) * 100 : 0;

                                        return (
                                            <div key={segment.label} className="space-y-2 border border-border px-4 py-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="block h-2.5 w-2.5 border border-white/20"
                                                            style={{ backgroundColor: allocationPalette[index % allocationPalette.length] }}
                                                            aria-hidden="true"
                                                        />
                                                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">
                                                            {segment.label}
                                                        </p>
                                                    </div>
                                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                                                        {allocationPct.toFixed(1)}%
                                                    </p>
                                                </div>
                                                <p className="text-right font-mono text-sm tabular-nums text-white">
                                                    {formatCurrency(segment.value)}
                                                </p>
                                                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                                                    {segment.sublabel}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                                Add holdings or cash to render allocation visuals.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Holdings</CardTitle>
                        <CardDescription>
                            Position-level details with edit and delete actions bound to the portfolio API.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="min-h-[320px]">
                            {portfolioQuery.isLoading ? (
                                <TerminalSkeleton lines={5} label="SYNCING HOLDINGS" />
                            ) : (
                                <div className="overflow-hidden border border-border">
                                    <Table className="table-fixed">
                                        <TableHeader>
                                            <TableRow className="border-border hover:bg-transparent">
                                                <TableHead className="w-[88px] px-3 font-mono text-[10px] uppercase tracking-[1.4px]">Ticker</TableHead>
                                                <TableHead className="w-[76px] px-3 text-right font-mono text-[10px] uppercase tracking-[1.4px]">Shares</TableHead>
                                                <TableHead className="px-3 text-right font-mono text-[10px] uppercase tracking-[1.4px]">Avg Price</TableHead>
                                                <TableHead className="px-3 text-right font-mono text-[10px] uppercase tracking-[1.4px]">Last Price</TableHead>
                                                <TableHead className="px-3 text-right font-mono text-[10px] uppercase tracking-[1.4px]">Market Value</TableHead>
                                                <TableHead className="px-3 text-right font-mono text-[10px] uppercase tracking-[1.4px]">Gain / Loss</TableHead>
                                                <TableHead className="w-[72px] px-3 text-right font-mono text-[10px] uppercase tracking-[1.4px]">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {portfolio?.holdings.map((holding) => (
                                                <TableRow key={holding.id} className="border-border/70 hover:bg-white/[0.03]">
                                                    <TableCell className="truncate px-3 font-mono text-sm uppercase tracking-[1.4px]">{holding.ticker}</TableCell>
                                                    <TableCell className="px-3 text-right font-mono text-sm tabular-nums">{formatNumber(holding.shares, "en-PH", 0)}</TableCell>
                                                    <TableCell className="px-3 text-right font-mono text-sm tabular-nums">{formatCurrency(holding.avgPrice)}</TableCell>
                                                    <TableCell className="px-3 text-right font-mono text-sm tabular-nums">{formatCurrency(holding.currentPrice)}</TableCell>
                                                    <TableCell className="px-3 text-right font-mono text-sm tabular-nums">{formatCurrency(holding.marketValue)}</TableCell>
                                                    <TableCell className={cn("px-3 text-right font-mono text-sm", gainClass(holding.gainLoss ?? 0))}>
                                                        <div className="flex flex-col items-end leading-tight">
                                                            <span className="tabular-nums">{formatSignedNumber(holding.gainLoss)}</span>
                                                            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-inherit/70 tabular-nums">
                                                                {holding.gainLossPercent === null ? "Cost basis needed" : formatPercent(holding.gainLossPercent)}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="px-3">
                                                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                className="text-white/30 hover:bg-white/5 hover:text-white"
                                                                onClick={() => setHoldingDialog({ mode: "edit", holding })}
                                                            >
                                                                <PencilLine />
                                                                <span className="sr-only">Edit {holding.ticker}</span>
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                className="text-white/30 hover:bg-white/5 hover:text-white"
                                                                onClick={() => {
                                                                    if (window.confirm(`Delete ${holding.ticker} from the portfolio?`)) {
                                                                        deleteHoldingMutation.mutate(holding.ticker);
                                                                    }
                                                                }}
                                                                disabled={deleteHoldingMutation.isPending}
                                                            >
                                                                <Trash2 />
                                                                <span className="sr-only">Delete {holding.ticker}</span>
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {portfolio?.holdings.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="py-10 text-center font-mono text-xs uppercase tracking-[1.4px] text-white/30">
                                                        No active positions found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

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
        </div>
    );
};

function SummaryCard({
    title,
    rows,
    actionLabel,
    onAction,
}: {
    title: string;
    rows: Array<{
        label: string;
        value: string;
        subvalue?: string;
        valueClassName?: string;
        subvalueClassName?: string;
    }>;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <Card size="sm">
            <CardHeader>
                <CardTitle className="text-[18px] leading-[1.2]">{title}</CardTitle>
                {actionLabel && onAction ? (
                    <CardAction>
                        <Button variant="outline" size="xs" onClick={onAction}>
                            {actionLabel}
                        </Button>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-2">
                {rows.map((row) => (
                    <StatRow
                        key={row.label}
                        label={row.label}
                        value={row.value}
                        subvalue={row.subvalue}
                        valueClassName={row.valueClassName}
                        subvalueClassName={row.subvalueClassName}
                    />
                ))}
            </CardContent>
        </Card>
    );
}

function StatRow({
    label,
    value,
    subvalue,
    valueClassName,
    subvalueClassName,
}: {
    label: string;
    value: string;
    subvalue?: string;
    valueClassName?: string;
    subvalueClassName?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-b-0 last:pb-0">
            <div className="min-w-0 space-y-0.5">
                <div className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{label}</div>
                {subvalue ? (
                    <div className={cn("font-mono text-[10px] uppercase tracking-[1.4px] tabular-nums", subvalueClassName ?? "text-white/30")}>
                        {subvalue}
                    </div>
                ) : null}
            </div>
            <div className={cn("shrink-0 text-right font-mono text-sm tabular-nums", valueClassName)}>{value}</div>
        </div>
    );
}

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
            <DialogContent className="border-border bg-background text-foreground shadow-none sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{mode === "add" ? "Add Holding" : `Edit ${holding?.ticker ?? "Holding"}`}</DialogTitle>
                    <DialogDescription>
                        {mode === "add"
                            ? "Create a new holding using the portfolio API."
                            : "Update the selected position and refresh the live table."}
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-4"
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
                    <div className="space-y-2">
                        <label htmlFor="holding-ticker" className="font-sans text-[14px] text-white/70">Ticker</label>
                        <TickerAutocompleteInput
                            id="holding-ticker"
                            name="ticker"
                            ariaLabel="Holding ticker"
                            value={ticker}
                            onChange={setTicker}
                            readOnly={mode === "edit"}
                            inputClassName={cn(mode === "edit" ? "text-white/70" : "text-white")}
                            placeholder="TEL"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="holding-shares" className="font-sans text-[14px] text-white/70">Shares</label>
                        <input
                            id="holding-shares"
                            name="shares"
                            type="number"
                            min="0"
                            step="1"
                            value={shares}
                            onChange={(event) => setShares(event.target.value)}
                            required
                            className="flex h-10 w-full border border-border bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="holding-average-price" className="font-sans text-[14px] text-white/70">Average Price</label>
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
                            className="flex h-10 w-full border border-border bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-ring"
                        />
                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
                            {latestPriceQuery.isFetching && !latestKnownPrice
                                ? "Fetching latest market price..."
                                : latestKnownPrice !== null && latestKnownPrice !== undefined && latestKnownPrice > 0
                                    ? `Latest market price ${formatCurrency(latestKnownPrice)}`
                                    : "Latest market price unavailable. Enter your cost basis manually."}
                        </p>
                    </div>

                    <DialogFooter className="gap-3">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Saving..." : mode === "add" ? "Create Holding" : "Update Holding"}
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
            <DialogContent className="border-border bg-background text-foreground shadow-none sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Update Cash</DialogTitle>
                    <DialogDescription>Adjust the available cash balance through the portfolio cash endpoint.</DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const nextAmount = Number(amount);

                        if (!Number.isFinite(nextAmount)) {
                            return;
                        }

                        onSubmit(nextAmount);
                    }}
                >
                    <div className="space-y-2">
                        <label htmlFor="cash-amount" className="font-sans text-[14px] text-white/70">Amount</label>
                        <input
                            id="cash-amount"
                            name="amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            required
                            className="flex h-10 w-full border border-border bg-transparent px-3 py-2 font-sans text-sm text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-ring"
                        />
                    </div>

                    <DialogFooter className="gap-3">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Saving..." : "Update Cash"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import type { MouseHandlerDataParam } from "recharts";

import { backendClient } from "@/api/backend/client";
import { engineClient } from "@/api/engine/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { TerminalSkeleton } from "@/components/ui/terminal-skeleton";
import { TickerAutocompleteInput } from "@/components/shared/TickerAutocomplete";
import { TradeWorkbench } from "@/features/trading/TradeWorkbench";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import {
    extractErrorMessage,
    formatCurrency,
    formatDate,
    formatNumber,
    formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    normalizeFinancialData,
    normalizeFinancialReports,
    normalizeMacroData,
    normalizeMarketChart,
    normalizeMarketOverview,
    normalizeNewsData,
    normalizePseData,
} from "@/data/normalizeMarket";

const metricKeys = [
    ["Last Traded Price", "price"],
    ["Open", "OPEN"],
    ["High", "HIGH"],
    ["Low", "LOW"],
    ["Volume", "volume"],
    ["Market Cap", "Market Capitalization"],
    ["Board Lot", "Board Lot"],
    ["Free Float", "Free Float Level(%)"],
    ["Foreign Limit", "Foreign Ownership Limit(%)"],
];

const chartRangeOptions = [
    { id: "1M", label: "1M", days: 31 },
    { id: "3M", label: "3M", days: 92 },
    { id: "6M", label: "6M", days: 183 },
    { id: "1Y", label: "1Y", days: 365 },
] as const;

type ChartRangeOption = (typeof chartRangeOptions)[number]["id"];

type SignalItem = {
    label: string;
    value: string;
    detail: string;
};

type SnapshotRow = {
    ticker: string;
    price: number | null;
    changePct: number | null;
    volume: number | null;
    relativeVolume: number | null;
};

type DisclosureViewerState = {
    title: string;
    companyName: string;
    url: string;
    externalUrl: string;
};

type ChartHoverPoint = {
    date: string;
    open: number | null;
    high: number | null;
    low: number | null;
    value: number | null;
    price: number | null;
    forecastMedian: number | null;
    movingAverage20: number | null;
    movingAverage50: number | null;
    rsi: number | null;
    comparisonPrice: number | null;
    kind: "historical" | "forecast";
};

type ChartSeriesPoint = {
    index: number;
    price: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    value: number | null;
    date: string;
    forecastBandBase: number | null;
    forecastBandRange: number | null;
    forecastMedian: number | null;
    movingAverage20: number | null;
    movingAverage50: number | null;
    rsi: number | null;
    comparisonPrice: number | null;
    kind: "historical" | "forecast";
};

const toNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const sentimentRank: Record<string, number> = {
    negative: -1,
    bearish: -1,
    neutral: 0,
    mixed: 0,
    positive: 1,
    bullish: 1,
};

const signalLabel = (score: number) => {
    if (score > 0) return "BULLISH";
    if (score < 0) return "BEARISH";
    return "NEUTRAL";
};

const toChartApiDate = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();

    return `${month}-${day}-${year}`;
};

const getChartWindow = (range: ChartRangeOption) => {
    const rangeConfig = chartRangeOptions.find((option) => option.id === range) ?? chartRangeOptions[chartRangeOptions.length - 1];
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - rangeConfig.days);

    return {
        startDate: toChartApiDate(startDate),
        endDate: toChartApiDate(endDate),
    };
};

const calculateMovingAverage = (
    points: Array<{ close: number | null }>,
    index: number,
    windowSize: number
) => {
    const windowStart = index - windowSize + 1;
    if (windowStart < 0) {
        return null;
    }

    const values = points
        .slice(windowStart, index + 1)
        .map((point) => point.close)
        .filter((value): value is number => typeof value === "number");

    if (values.length < windowSize) {
        return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const calculateRSI = (
    points: Array<{ close: number | null }>,
    index: number,
    period: number = 14
) => {
    if (index < period) {
        return null;
    }

    const windowPoints = points.slice(index - period, index + 1);
    const changes = [];
    for (let i = 1; i < windowPoints.length; i++) {
        const prev = windowPoints[i - 1].close;
        const curr = windowPoints[i].close;
        if (prev !== null && curr !== null) {
            changes.push(curr - prev);
        }
    }

    if (changes.length < period) return null;

    let gains = 0;
    let losses = 0;

    for (const change of changes) {
        if (change >= 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
};

export const ResearchView = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [hoveredChartPoint, setHoveredChartPoint] = useState<ChartHoverPoint | null>(null);
    const [activeDisclosure, setActiveDisclosure] = useState<DisclosureViewerState | null>(null);
    const [invertDisclosure, setInvertDisclosure] = useState(true);
    const [isDisclosureFrameLoaded, setIsDisclosureFrameLoaded] = useState(false);
    const [tickerDraft, setTickerDraft] = useState((searchParams.get("ticker") ?? "TEL").toUpperCase());
    const [chartRange, setChartRange] = useState<ChartRangeOption>("1Y");
    const [showForecast, setShowForecast] = useState(true);
    const [showMovingAverage20, setShowMovingAverage20] = useState(true);
    const [showMovingAverage50, setShowMovingAverage50] = useState(false);
    const [showRSI, setShowRSI] = useState(false);
    const [comparisonTicker, setComparisonTicker] = useState<string | null>(null);
    const [comparisonInput, setComparisonInput] = useState("");

    const selectedTicker = (searchParams.get("ticker") ?? "TEL").toUpperCase();
    const isTradeDrawerOpen = searchParams.get("drawer") === "trade";
    const chartWindow = useMemo(() => getChartWindow(chartRange), [chartRange]);

    useEffect(() => {
        setTickerDraft(selectedTicker);
    }, [selectedTicker]);

    useEffect(() => {
        if (activeDisclosure) {
            setInvertDisclosure(true);
            setIsDisclosureFrameLoaded(false);
        }
    }, [activeDisclosure]);

    useEffect(() => {
        setHoveredChartPoint(null);
    }, [selectedTicker, chartRange]);

    const setSelectedTicker = (ticker: string) => {
        const next = new URLSearchParams(searchParams);
        next.set("ticker", ticker.toUpperCase());
        setSearchParams(next, { replace: true });
    };

    const setTradeDrawerOpen = (open: boolean) => {
        const next = new URLSearchParams(searchParams);

        if (open) {
            next.set("drawer", "trade");
        } else {
            next.delete("drawer");
        }

        setSearchParams(next, { replace: true });
    };

    const marketQuery = useQuery({
        queryKey: ["market-overview", selectedTicker],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/market/{ticker}", {
                params: { path: { ticker: selectedTicker } },
            });

            if (error) throw error;
            return normalizeMarketOverview(data);
        },
        placeholderData: keepPreviousData,
    });

    const chartQuery = useQuery({
        queryKey: ["market-chart", selectedTicker, chartWindow.startDate, chartWindow.endDate],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/market/{ticker}/chart", {
                params: {
                    path: { ticker: selectedTicker },
                    query: {
                        start_date: chartWindow.startDate,
                        end_date: chartWindow.endDate,
                    },
                },
            });

            if (error) throw error;
            return normalizeMarketChart(data);
        },
            placeholderData: keepPreviousData,
        });

        const comparisonChartQuery = useQuery({
            queryKey: ["comparison-chart", comparisonTicker, chartWindow.startDate, chartWindow.endDate],
            enabled: Boolean(comparisonTicker),
            queryFn: async () => {
                if (!comparisonTicker) return null;
                const { data, error } = await backendClient.GET("/api/v1/market/{ticker}/chart", {
                    params: {
                        path: { ticker: comparisonTicker },
                        query: {
                            start_date: chartWindow.startDate,
                            end_date: chartWindow.endDate,
                        },
                    },
                });

                if (error) throw error;
                return normalizeMarketChart(data);
            },
            placeholderData: keepPreviousData,
        });

        const financialDataQuery = useQuery({

        queryKey: ["financial-data", selectedTicker],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/market/{ticker}/financial-data", {
                params: { path: { ticker: selectedTicker } },
            });

            if (error) throw error;
            return normalizeFinancialData(data);
        },
        placeholderData: keepPreviousData,
    });

    const financialReportsQuery = useQuery({
        queryKey: ["financial-reports", selectedTicker],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/market/{ticker}/financial-reports", {
                params: { path: { ticker: selectedTicker } },
            });

            if (error) throw error;
            return normalizeFinancialReports(data);
        },
        placeholderData: keepPreviousData,
    });

    const macroQuery = useQuery({
        queryKey: ["macro-data"],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/data/macro", {
                params: { query: { limit: 6 } },
            });

            if (error) throw error;
            return normalizeMacroData(data);
        },
    });

    const newsQuery = useQuery({
        queryKey: ["news-data", selectedTicker],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/data/news", {
                params: { query: { ticker: selectedTicker, limit: 6 } },
            });

            if (error) throw error;
            return normalizeNewsData(data);
        },
        placeholderData: keepPreviousData,
    });

    const pseQuery = useQuery({
        queryKey: ["pse-data", selectedTicker],
        queryFn: async () => {
            const { data, error } = await backendClient.GET("/api/v1/data/pse", {
                params: { query: { ticker: selectedTicker, limit: 1 } },
            });

            if (error) throw error;
            return normalizePseData(data);
        },
        placeholderData: keepPreviousData,
    });

    const chartData = chartQuery.isPlaceholderData ? undefined : chartQuery.data;

    const closes = useMemo(
        () => chartData?.map((point) => point.close).filter((value): value is number => typeof value === "number") ?? [],
        [chartData]
    );
    const forecastHistory = useMemo(() => closes.slice(-60), [closes]);

    const forecastQuery = useQuery({
        queryKey: ["forecast", selectedTicker, forecastHistory],
        enabled: forecastHistory.length >= 10,
        queryFn: async () => {
            const { data, error } = await engineClient.POST("/api/v1/forecast/", {
                body: {
                    history: forecastHistory,
                    prediction_length: 24,
                    quantiles: [0.1, 0.5, 0.9],
                },
            });

            if (error) throw error;
            return data as { forecasts: Record<string, number[]> };
        },
        placeholderData: keepPreviousData,
    });

    const forecastData = forecastQuery.isPlaceholderData ? undefined : forecastQuery.data;

    const combinedChartData = useMemo<ChartSeriesPoint[]>(() => {
        const comparisonMap = new Map<string, number>();
        if (comparisonChartQuery.data) {
            comparisonChartQuery.data.forEach((p) => {
                if (p.date && p.close !== null) {
                    comparisonMap.set(p.date, p.close);
                }
            });
        }

        const historical = chartData?.map((point, index) => ({
            index,
            price: point.close,
            open: point.open,
            high: point.high,
            low: point.low,
            value: point.value,
            date: point.date,
            forecastBandBase: null as number | null,
            forecastBandRange: null as number | null,
            forecastMedian: null as number | null,
            movingAverage20: calculateMovingAverage(chartData ?? [], index, 20),
            movingAverage50: calculateMovingAverage(chartData ?? [], index, 50),
            rsi: calculateRSI(chartData ?? [], index, 14),
            comparisonPrice: comparisonMap.get(point.date) ?? null,
            kind: "historical" as const,
        })) ?? [];

        const forecast = forecastData?.forecasts ?? null;

        if (!forecast) return historical;

        const q05 = forecast["q_0.5"] ?? [];
        const q01 = forecast["q_0.1"] ?? [];
        const q09 = forecast["q_0.9"] ?? [];

        const forecastSeries = q05.map((value, index) => {
            const lower = q01[index] ?? null;
            const upper = q09[index] ?? null;

            return {
                index: historical.length + index,
                price: null,
                open: null,
                high: null,
                low: null,
                value: null,
                date: `T+${index + 1}`,
                forecastBandBase: lower,
                forecastBandRange: lower !== null && upper !== null ? Math.max(upper - lower, 0) : null,
                forecastMedian: value ?? null,
                movingAverage20: null,
                movingAverage50: null,
                rsi: null,
                comparisonPrice: null,
                kind: "forecast" as const,
            };
        });

        return [...historical, ...forecastSeries];
    }, [chartData, forecastData, comparisonChartQuery.data]);

    const overview = !marketQuery.isPlaceholderData && marketQuery.data?.ticker === selectedTicker ? marketQuery.data : null;
    const stockData = useMemo(() => overview?.stockData ?? {}, [overview]);
    const latestChart = chartData?.at(-1);
    const latestForecast = forecastData?.forecasts?.["q_0.5"]?.at(-1);
    const latestForecastLow = forecastData?.forecasts?.["q_0.1"]?.at(-1);
    const latestForecastHigh = forecastData?.forecasts?.["q_0.9"]?.at(-1);

    const researchSignals = useMemo<SignalItem[]>(() => {
        const latestPrice = overview?.price ?? latestChart?.close ?? null;
        const medianForecast = latestForecast ?? null;
        const forecastTrend = latestPrice !== null && medianForecast !== null
            ? signalLabel(medianForecast - latestPrice)
            : "WAITING";

        const newsScores = (newsQuery.data ?? []).map((item) => {
            const label = String(item.sentiment_label ?? item.sentiment ?? "neutral").toLowerCase();
            return sentimentRank[label] ?? 0;
        });
        const avgNews = newsScores.length ? newsScores.reduce((sum, value) => sum + value, 0) / newsScores.length : 0;

        const macroValues = (macroQuery.data ?? []).map((item) => toNumber(item.value)).filter((value): value is number => value !== null);
        const avgMacro = macroValues.length ? macroValues.reduce((sum, value) => sum + value, 0) / macroValues.length : 0;

        const valuation = toNumber(stockData["Price to Earnings Ratio"] ?? stockData["P/E Ratio"] ?? stockData["P/E"]);

        return [
            {
                label: "Forecast Trend",
                value: forecastTrend,
                detail: medianForecast !== null && latestPrice !== null
                    ? `${formatCurrency(latestPrice)} → ${formatCurrency(medianForecast)}`
                    : "Awaiting forecast window",
            },
            {
                label: "News Sentiment",
                value: signalLabel(avgNews),
                detail: `${(newsQuery.data ?? []).length} items sampled`,
            },
            {
                label: "Macro Regime",
                value: signalLabel(avgMacro),
                detail: macroValues.length ? `${formatNumber(avgMacro, "en-PH", 2)} average signal` : "No macro values available",
            },
            {
                label: "Valuation",
                value: valuation && valuation > 0 ? (valuation < 15 ? "FAIR" : valuation < 25 ? "STRETCHED" : "RICH") : "UNKNOWN",
                detail: valuation ? `P/E ${formatNumber(valuation, "en-PH", 2)}` : "No valuation ratio available",
            },
        ];
    }, [latestChart?.close, latestForecast, macroQuery.data, newsQuery.data, overview?.price, stockData]);

    const marketSnapshotRows = useMemo<SnapshotRow[]>(() => {
        return (pseQuery.data ?? [])
            .map((item) => {
                const volume = toNumber(item.volume ?? item.Volume ?? 0);
                const averageVolume = toNumber(item.average_volume ?? item.averageVolume ?? item.avg_volume ?? item.avgVolume ?? null);

                return {
                    ticker: String(item.ticker ?? item.symbol ?? selectedTicker),
                    price: toNumber(item.close ?? item.price ?? item.last ?? null),
                    changePct: toNumber(item.change_pct ?? item.changePct ?? item.percent_change ?? null),
                    volume,
                    relativeVolume: volume !== null && averageVolume ? volume / averageVolume : null,
                };
            })
            .filter((row) => row.ticker);
    }, [pseQuery.data, selectedTicker]);

    const latestForecastLabel = useMemo(() => {
        if (latestForecast === null || latestForecast === undefined) return "Awaiting forecast";
        return formatCurrency(latestForecast);
    }, [latestForecast]);

    const latestHistoricalPoint = useMemo(
        () => [...combinedChartData].reverse().find((point) => point.kind === "historical") ?? null,
        [combinedChartData]
    );

    const chartLegendPoint = hoveredChartPoint ?? latestHistoricalPoint;
    const hasActivityData = useMemo(
        () => combinedChartData.some((point) => point.kind === "historical" && point.value !== null),
        [combinedChartData]
    );

    const onChartHover = (state: MouseHandlerDataParam) => {
        const payload = (state as MouseHandlerDataParam & {
            activePayload?: Array<{ payload: ChartSeriesPoint }>;
        }).activePayload?.[0]?.payload;
        const activeIndex = typeof state.activeTooltipIndex === "number"
            ? state.activeTooltipIndex
            : typeof state.activeIndex === "number"
                ? state.activeIndex
                : null;
        const nextPoint = payload ?? (activeIndex !== null ? combinedChartData[activeIndex] : null);

        if (!nextPoint) {
            return;
        }

        setHoveredChartPoint({
            date: String(nextPoint.date ?? "---"),
            open: toNumber(nextPoint.open ?? null),
            high: toNumber(nextPoint.high ?? null),
            low: toNumber(nextPoint.low ?? null),
            value: toNumber(nextPoint.value ?? null),
            price: toNumber(nextPoint.price ?? null),
            forecastMedian: toNumber(nextPoint.forecastMedian ?? null),
            movingAverage20: toNumber(nextPoint.movingAverage20 ?? null),
            movingAverage50: toNumber(nextPoint.movingAverage50 ?? null),
            rsi: toNumber(nextPoint.rsi ?? null),
            comparisonPrice: toNumber(nextPoint.comparisonPrice ?? null),
            kind: nextPoint.kind === "forecast" ? "forecast" : "historical",
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8 md:px-8 md:py-12">
            <header className="grid gap-4 border-b border-border pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(560px,640px)] lg:items-start lg:gap-8">
                <div className="space-y-3">
                    <Badge variant="outline" className="border-border text-muted-foreground">
                        [ Market Research ]
                    </Badge>
                    <h1 className="font-sans text-[30px] leading-[1.2]">Research Terminal</h1>
                    <p className="max-w-[760px] font-sans text-[16px] leading-[1.5] text-muted-foreground">
                        Live market context, chart history, engine forecasts, disclosures, and sentiment feeds pulled directly from the backend.
                    </p>
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start lg:pt-1">
                    <TickerAutocompleteInput
                        value={tickerDraft}
                        onChange={setTickerDraft}
                        onSelect={(item) => setSelectedTicker(item.ticker)}
                        className="w-full min-w-0"
                        inputClassName="text-white"
                    />
                    <Link
                        to={`/agent?ticker=${selectedTicker}&mode=research`}
                        className={cn(buttonVariants({ variant: "outline" }), "w-full whitespace-nowrap sm:w-auto sm:self-start")}
                    >
                        Ask AGOS
                    </Link>
                    <Button
                        variant="outline"
                        className="w-full whitespace-nowrap sm:w-auto sm:self-start"
                        onClick={() => {
                            const nextTicker = tickerDraft.trim().toUpperCase() || selectedTicker;
                            const next = new URLSearchParams(searchParams);
                            next.set("ticker", nextTicker);
                            next.set("drawer", "trade");
                            setSearchParams(next, { replace: true });
                        }}
                    >
                        Evaluate Trade
                    </Button>
                </div>
            </header>

            {marketQuery.error || chartQuery.error ? (
                <div className="rounded-2xl border border-border bg-card px-6 py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                    Market data error: {extractErrorMessage(marketQuery.error ?? chartQuery.error)}
                </div>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.65fr)]">
                <Card className="min-h-[380px]">
                    <CardHeader>
                        <CardTitle>{overview?.companyName ?? "Loading company..."}</CardTitle>
                        <CardDescription>
                            {overview?.ticker ?? selectedTicker} / {formatDate(overview?.lastUpdated)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {overview ? (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <Metric label="Price" value={formatCurrency(overview?.price)} />
                                    <Metric label="52W High" value={formatNumber(toNumber(stockData["week_52_high"] ?? stockData["52W High"]))} />
                                    <Metric label="52W Low" value={formatNumber(toNumber(stockData["week_52_low"] ?? stockData["52W Low"]))} />
                                    <Metric label="Volume" value={formatNumber(toNumber(stockData["Volume"] ?? stockData["volume"]), "en-PH", 0)} />
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {metricKeys.map(([label, key]) => (
                                        <div key={label} className="space-y-1 border border-border px-4 py-3">
                                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{label}</p>
                                            <p className="text-right font-mono text-sm tabular-nums text-white">
                                                {renderMetricValue(stockData, latestChart, overview?.price ?? null, key, label)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <TerminalSkeleton lines={8} label="SYNCING MARKET" />
                        )}
                    </CardContent>
                </Card>

                <Card className="min-h-[380px]">
                    <CardHeader>
                        <CardTitle>Research Signals</CardTitle>
                        <CardDescription>Signal synthesis from forecast, news, macro, and valuation data.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {overview ? (
                            <>
                                {researchSignals.map((signal) => (
                                    <div key={signal.label} className="space-y-2 border border-border px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{signal.label}</p>
                                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{signal.value}</p>
                                        </div>
                                        <p className="font-sans text-[14px] leading-[1.5] text-white/70">{signal.detail}</p>
                                    </div>
                                ))}

                                <div className="space-y-2 border border-border px-4 py-3">
                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">Forecast Window</p>
                                    <p className="font-sans text-[30px] leading-none text-white">{latestForecastLabel}</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <MiniMetric label="Low" value={formatCurrency(latestForecastLow)} />
                                        <MiniMetric label="High" value={formatCurrency(latestForecastHigh)} />
                                    </div>
                                    <p className="font-sans text-[14px] leading-[1.5] text-white/70">
                                        {closes.length >= 10 ? `${closes.length} history points available` : "Need at least 10 points to forecast"}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <TerminalSkeleton lines={6} label="SYNCING SIGNALS" />
                        )}
                    </CardContent>
                </Card>
            </section>

            <Card>
                <CardHeader>
                    <CardTitle>Price Action</CardTitle>
                    <CardDescription>
                        Historical closes, engine forecast bands, and activity-by-value context for {selectedTicker}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4 border border-border px-4 py-3">
                        <div className="space-y-2">
                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">Window</p>
                            <div className="flex flex-wrap gap-2">
                                {chartRangeOptions.map((option) => (
                                    <Button
                                        key={option.id}
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => setChartRange(option.id)}
                                        aria-pressed={chartRange === option.id}
                                        className={cn(
                                            chartRange === option.id
                                                ? "border-white/20 bg-white/5 text-white"
                                                : "text-white/50 hover:text-white"
                                        )}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">Overlays</p>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => setShowForecast((value) => !value)}
                                    aria-pressed={showForecast}
                                    className={cn(showForecast ? "border-white/20 bg-white/5 text-white" : "text-white/50 hover:text-white")}
                                >
                                    Forecast
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => setShowMovingAverage20((value) => !value)}
                                    aria-pressed={showMovingAverage20}
                                    className={cn(showMovingAverage20 ? "border-chart-2/40 bg-chart-2/10 text-chart-2" : "text-white/50 hover:text-white")}
                                >
                                    MA 20
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => setShowMovingAverage50((value) => !value)}
                                    aria-pressed={showMovingAverage50}
                                    className={cn(showMovingAverage50 ? "border-chart-1/40 bg-chart-1/10 text-chart-1" : "text-white/50 hover:text-white")}
                                >
                                    MA 50
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    onClick={() => setShowRSI((value) => !value)}
                                    aria-pressed={showRSI}
                                    className={cn(showRSI ? "border-white/20 bg-white/5 text-white" : "text-white/50 hover:text-white")}
                                >
                                    RSI
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="comparison-ticker" className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">Compare</label>
                            <div className="flex gap-2">
                                <TickerAutocompleteInput
                                    id="comparison-ticker"
                                    name="comparison-ticker"
                                    ariaLabel="Comparison ticker"
                                    value={comparisonInput}
                                    onChange={setComparisonInput}
                                    onSelect={(item) => setComparisonTicker(item.ticker)}
                                    className="h-7 w-24 min-w-0"
                                    inputClassName="h-7 text-[10px] text-white"
                                    showHint={false}
                                />
                                {comparisonTicker ? (
                                    <Button
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => {
                                            setComparisonTicker(null);
                                            setComparisonInput("");
                                        }}
                                        className="h-7 text-[10px] text-white/50 hover:text-white"
                                    >
                                        Clear
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
                        <div className="grid gap-3">
                            <div className="relative h-[420px] min-w-0 overflow-hidden border border-border px-2 py-4">
                                {combinedChartData.length ? (
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <AreaChart
                                            syncId="research-price-action"
                                            data={combinedChartData}
                                            onMouseMove={onChartHover}
                                            onMouseLeave={() => setHoveredChartPoint(null)}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--foreground) 8%, transparent)" vertical={false} />
                                            <XAxis dataKey="index" hide />
                                            <YAxis
                                                domain={["auto", "auto"]}
                                                tick={{ fill: "color-mix(in oklch, var(--foreground) 35%, transparent)", fontSize: 10, fontFamily: "monospace" }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: "color-mix(in oklch, var(--foreground) 22%, transparent)", strokeWidth: 1 }}
                                                content={<PriceActionTooltip />}
                                            />
                                            {showForecast ? (
                                                <>
                                                    <Area type="monotone" dataKey="forecastBandBase" stackId="forecast" stroke="none" fill="var(--card)" connectNulls />
                                                    <Area type="monotone" dataKey="forecastBandRange" stackId="forecast" stroke="none" fill="color-mix(in oklch, var(--chart-1) 18%, transparent)" connectNulls />
                                                </>
                                            ) : null}
                                            <Line type="monotone" dataKey="price" stroke="var(--foreground)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "var(--foreground)", strokeWidth: 0 }} connectNulls />
                                            {showForecast ? (
                                                <Line type="monotone" dataKey="forecastMedian" stroke="var(--chart-1)" strokeDasharray="5 5" strokeWidth={1} dot={false} activeDot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }} connectNulls />
                                            ) : null}
                                            {showMovingAverage20 ? (
                                                <Line type="monotone" dataKey="movingAverage20" stroke="var(--chart-2)" strokeWidth={1} dot={false} activeDot={{ r: 2, fill: "var(--chart-2)", strokeWidth: 0 }} connectNulls />
                                            ) : null}
                                            {showMovingAverage50 ? (
                                                <Line type="monotone" dataKey="movingAverage50" stroke="var(--chart-1)" strokeWidth={1} dot={false} activeDot={{ r: 2, fill: "var(--chart-1)", strokeWidth: 0 }} connectNulls />
                                            ) : null}
                                            {comparisonTicker ? (
                                                <Line type="monotone" dataKey="comparisonPrice" stroke="color-mix(in oklch, var(--foreground) 50%, transparent)" strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={{ r: 2, fill: "color-mix(in oklch, var(--foreground) 50%, transparent)", strokeWidth: 0 }} connectNulls />
                                            ) : null}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <TerminalSkeleton lines={5} label="WAITING FOR PRICE DATA" />
                                    </div>
                                )}
                            </div>

                            {hasActivityData ? (
                                <div className="relative h-[120px] min-w-0 overflow-hidden border border-border px-2 py-3">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <BarChart
                                            syncId="research-price-action"
                                            data={combinedChartData}
                                            onMouseMove={onChartHover}
                                            onMouseLeave={() => setHoveredChartPoint(null)}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--foreground) 7%, transparent)" vertical={false} />
                                            <XAxis dataKey="index" hide />
                                            <YAxis hide />
                                            <Tooltip
                                                cursor={{ fill: "color-mix(in oklch, var(--foreground) 6%, transparent)" }}
                                                content={<ActivityTooltip />}
                                            />
                                            <Bar dataKey="value" fill="color-mix(in oklch, var(--foreground) 22%, transparent)" radius={4} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="border border-dashed border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">
                                    Activity / value histogram unavailable for this series.
                                </div>
                            )}

                            {showRSI ? (
                                <div className="relative h-[120px] min-w-0 overflow-hidden border border-border px-2 py-3">
                                    <div className="absolute left-4 top-2 z-10 font-mono text-[8px] uppercase tracking-[1px] text-white/55">
                                        Relative Strength Index (14)
                                    </div>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <AreaChart
                                            syncId="research-price-action"
                                            data={combinedChartData}
                                            onMouseMove={onChartHover}
                                            onMouseLeave={() => setHoveredChartPoint(null)}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in oklch, var(--foreground) 7%, transparent)" vertical={false} />
                                            <XAxis dataKey="index" hide />
                                            <YAxis 
                                                domain={[0, 100]} 
                                                ticks={[30, 70]}
                                                tick={{ fill: "color-mix(in oklch, var(--foreground) 28%, transparent)", fontSize: 8, fontFamily: "monospace" }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={25}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: "color-mix(in oklch, var(--foreground) 22%, transparent)", strokeWidth: 1 }}
                                                content={<RSITooltip />}
                                            />
                                            <Area 
                                                type="monotone" 
                                                dataKey="rsi" 
                                                stroke="var(--foreground)" 
                                                fill="color-mix(in oklch, var(--foreground) 8%, transparent)" 
                                                strokeWidth={1} 
                                                dot={false} 
                                                connectNulls 
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-border bg-popover/95 p-3 xl:sticky xl:top-4">
                                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                                    {chartLegendPoint ? (chartLegendPoint.kind === "forecast" ? "FORECAST" : "HISTORICAL") : "HOVER"}
                                </p>
                                <div className="mt-2 space-y-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">Date</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{chartLegendPoint?.date ?? "---"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">Close</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{formatCurrency(chartLegendPoint?.price)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">Forecast</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{formatCurrency(chartLegendPoint?.forecastMedian)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">MA 20</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-chart-2">{formatCurrency(chartLegendPoint?.movingAverage20)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">MA 50</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-chart-1">{formatCurrency(chartLegendPoint?.movingAverage50)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">RSI</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">
                                            {chartLegendPoint?.rsi !== null ? chartLegendPoint?.rsi?.toFixed(1) : "---"}
                                        </span>
                                    </div>
                                    {comparisonTicker ? (
                                        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-1">
                                            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">Compare {comparisonTicker}</span>
                                            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/70">{formatCurrency(chartLegendPoint?.comparisonPrice)}</span>
                                        </div>
                                    ) : null}
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">High / Low</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">
                                            {formatCurrency(chartLegendPoint?.high)} / {formatCurrency(chartLegendPoint?.low)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">Activity / Value</span>
                                        <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{formatNumber(chartLegendPoint?.value, "en-PH", 0)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-popover/95 p-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">Market Snapshot</p>
                                        <p className="font-sans text-[14px] leading-[1.5] text-white/70">
                                            Compact market tape with price, movement, and relative activity.
                                        </p>
                                    </div>
                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">
                                        {marketSnapshotRows.length === 1 ? "1 row" : `${marketSnapshotRows.length} rows`}
                                    </p>
                                </div>

                                <div className="mt-3 space-y-3">
                                    {marketSnapshotRows.length ? (
                                        marketSnapshotRows.map((row, index) => (
                                            <div key={row.ticker} className="space-y-3 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white">{row.ticker}</p>
                                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">#{index + 1}</p>
                                                </div>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    <Metric label="Price" value={formatCurrency(row.price)} />
                                                    <Metric label="Change" value={formatPercent(row.changePct)} />
                                                    <Metric label="Volume" value={formatNumber(row.volume, "en-PH", 0)} />
                                                    <Metric
                                                        label="Rel Vol"
                                                        value={
                                                            row.relativeVolume !== null
                                                                ? `${formatNumber(row.relativeVolume, "en-PH", 2)}x`
                                                                : "---"
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <EmptyState label="No market tape data available." />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <section className="flex flex-col gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Disclosures</CardTitle>
                        <CardDescription>Recent financial filings from the market data endpoint.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {financialDataQuery.data?.length ? financialDataQuery.data.map((item, index) => {
                            const disclosureViewer = getDisclosureViewerState(item, overview?.companyName ?? selectedTicker);
                            const externalUrl = typeof item.Link === "string" && item.Link.trim() ? item.Link : disclosureViewer?.externalUrl;

                            return (
                                <div key={index} className="space-y-2 border border-border px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-sans text-sm text-white">{String(item["Report Type"] ?? item.report_type ?? "Report")}</p>
                                        <Badge variant="outline" className="border-border text-white/70">
                                            {String(item["PSE Form Number"] ?? item.form ?? "Form")}
                                        </Badge>
                                    </div>
                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                                        {String(item["Company Name"] ?? item.company_name ?? overview?.companyName ?? selectedTicker)}
                                    </p>
                                    <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                                        <span>{String(item.Date ?? item.date ?? "---")}</span>
                                        <span>{String(item["Report Number"] ?? item.report_number ?? "---")}</span>
                                        {disclosureViewer ? (
                                            <button
                                                type="button"
                                                onClick={() => setActiveDisclosure(disclosureViewer)}
                                                className="inline-flex items-center gap-1 text-white hover:text-white/70"
                                            >
                                                View
                                            </button>
                                        ) : null}
                                        {externalUrl ? (
                                            <a href={externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/70 hover:text-white">
                                                Open <ArrowTopRightOnSquareIcon className="size-3" />
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        }) : <EmptyState label="No disclosures available." />}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Financial Statements</CardTitle>
                        <CardDescription>Yearly and quarterly snapshots returned by the backend.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {financialReportsQuery.data?.yearly ? (
                            <FinancialReportBlock title="Yearly" data={financialReportsQuery.data.yearly} />
                        ) : null}
                        {financialReportsQuery.data?.quarterly ? (
                            <FinancialReportBlock title="Quarterly" data={financialReportsQuery.data.quarterly} />
                        ) : null}
                        {!financialReportsQuery.data?.yearly && !financialReportsQuery.data?.quarterly ? (
                            <EmptyState label="No financial reports available." />
                        ) : null}
                    </CardContent>
                </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Macro Indicators</CardTitle>
                        <CardDescription>Latest macroeconomic indicators from the backend.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {macroQuery.data?.length ? macroQuery.data.map((item, index) => (
                            <div key={index} className="space-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
                                <div className="flex items-baseline justify-between gap-3">
                                    <p className="font-sans text-sm text-white">{String(item.indicator ?? item.name ?? "Indicator")}</p>
                                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{String(item.date ?? item.period ?? "---")}</p>
                                </div>
                                <p className="text-right font-mono text-[12px] tabular-nums text-white/70">{formatNumber(Number(item.value))}</p>
                            </div>
                        )) : <EmptyState label="No macro data available." />}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>News Sentiment</CardTitle>
                        <CardDescription>Filtered by ticker and limited to the most recent items.</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-[55vh] space-y-3 overflow-y-auto pr-2 [scrollbar-gutter:stable] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {newsQuery.data?.length ? newsQuery.data.map((item, index) => {
                            const headline = String(item.headline ?? item.title ?? "Untitled");
                            const sourceUrl = getNewsSourceUrl(item);

                            return (
                                <article key={index} className="space-y-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 space-y-1">
                                            {sourceUrl ? (
                                                <a
                                                    href={sourceUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block text-left font-sans text-sm leading-[1.5] text-white underline-offset-4 transition-colors hover:text-white/70 hover:underline"
                                                >
                                                    {headline}
                                                </a>
                                            ) : (
                                                <p className="font-sans text-sm leading-[1.5] text-white">{headline}</p>
                                            )}
                                            {sourceUrl ? (
                                                <a
                                                    href={sourceUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55 transition-colors hover:text-white/70"
                                                >
                                                    Open article <ArrowTopRightOnSquareIcon className="size-3" />
                                                </a>
                                            ) : null}
                                        </div>
                                        <Badge variant="outline" className="border-border text-white/70">
                                            {String(item.sentiment_label ?? "Neutral")}
                                        </Badge>
                                    </div>
                                    <p className="font-sans text-[14px] leading-[1.5] text-white/70">
                                        {String(item.summary ?? "")}
                                    </p>
                                    <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">
                                        <span>{String(item.date ?? "---")}</span>
                                        <span>{formatNumber(Number(item.sentiment_score ?? 0))}</span>
                                    </div>
                                </article>
                            );
                        }) : <EmptyState label="No news items available." />}
                    </CardContent>
                </Card>
            </section>

            <Drawer open={isTradeDrawerOpen} onOpenChange={setTradeDrawerOpen}>
                <DrawerContent side="right" className="w-full max-w-[640px] p-0">
                    <DrawerTitle className="sr-only">Trade Evaluation</DrawerTitle>
                    <DrawerDescription className="sr-only">Evaluate the selected ticker in the decision engine.</DrawerDescription>
                    <div className="h-full overflow-y-auto px-4 py-4">
                        <TradeWorkbench
                            ticker={selectedTicker}
                            onTickerChange={setSelectedTicker}
                            showHeader={false}
                            compact
                            className="pb-4"
                        />
                    </div>
                </DrawerContent>
            </Drawer>

            <Dialog open={Boolean(activeDisclosure)} onOpenChange={(open) => {
                if (!open) {
                    setActiveDisclosure(null);
                    setIsDisclosureFrameLoaded(false);
                }
            }}>
                <DialogContent className="max-h-[90vh] overflow-hidden border-border bg-background p-0 text-foreground shadow-none sm:max-w-[1100px]">
                    <DialogHeader className="border-b border-border px-6 py-4">
                        <DialogTitle>{activeDisclosure?.title ?? "Disclosure Viewer"}</DialogTitle>
                        <DialogDescription>
                            {activeDisclosure?.companyName ?? selectedTicker} / dark-mode preview with external fallback.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">
                        <span>
                            {isDisclosureFrameLoaded
                                ? invertDisclosure ? "Dark filter enabled" : "Original colors"
                                : "Loading embedded preview"}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" size="xs" onClick={() => setInvertDisclosure((value) => !value)}>
                                {invertDisclosure ? "Show original" : "Enable dark filter"}
                            </Button>
                            {activeDisclosure?.externalUrl ? (
                                <a href={activeDisclosure.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-white/70 hover:text-white">
                                    Open externally <ArrowTopRightOnSquareIcon className="size-3" />
                                </a>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-3 p-6">
                        {!isDisclosureFrameLoaded ? (
                            <div className="border border-dashed border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/60">
                                Embedded filing previews can stall or be blocked by the source. If the frame stays blank, use the external link above.
                            </div>
                        ) : null}
                        <div className="border border-white/10 bg-white p-2">
                            {activeDisclosure?.url ? (
                                <iframe
                                    title={activeDisclosure.title}
                                    src={activeDisclosure.url}
                                    onLoad={() => setIsDisclosureFrameLoaded(true)}
                                    className="h-[68vh] w-full border-0 bg-white"
                                    style={invertDisclosure ? { filter: "invert(1) hue-rotate(180deg) contrast(0.92)" } : undefined}
                                />
                            ) : null}
                        </div>
                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">
                            If the filing refuses to render in-frame, open it externally from the link above.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1 border border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{label}</p>
            <p className="text-right font-mono text-sm tabular-nums text-white">{value}</p>
        </div>
    );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1 border border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{label}</p>
            <p className="text-right font-mono text-[16px] leading-none tabular-nums text-white">{value}</p>
        </div>
    );
}

function EmptyState({ label }: { label: string }) {
    return <p className="py-4 font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">{label}</p>;
}

function PriceActionTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ payload: ChartSeriesPoint }>;
}) {
    const point = active ? payload?.[0]?.payload : null;

    if (!point) {
        return null;
    }

    return (
        <div className="space-y-1 rounded-2xl border border-border bg-popover/95 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
            <div className="flex items-center justify-between gap-4 text-white">
                <span>Date</span>
                <span>{point.date}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Close</span>
                <span>{formatCurrency(point.price)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Forecast</span>
                <span>{formatCurrency(point.forecastMedian)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>MA 20</span>
                <span>{formatCurrency(point.movingAverage20)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>MA 50</span>
                <span>{formatCurrency(point.movingAverage50)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>High / Low</span>
                <span>{formatCurrency(point.high)} / {formatCurrency(point.low)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Activity / Value</span>
                <span>{formatNumber(point.value, "en-PH", 0)}</span>
            </div>
        </div>
    );
}

function ActivityTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ payload: ChartSeriesPoint }>;
}) {
    const point = active ? payload?.[0]?.payload : null;

    if (!point) {
        return null;
    }

    return (
        <div className="space-y-1 rounded-2xl border border-border bg-popover/95 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
            <div className="flex items-center justify-between gap-4 text-white">
                <span>Date</span>
                <span>{point.date}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Activity / Value</span>
                <span>{formatNumber(point.value, "en-PH", 0)}</span>
            </div>
        </div>
    );
}

function RSITooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ payload: ChartSeriesPoint }>;
}) {
    const point = active ? payload?.[0]?.payload : null;

    if (!point) {
        return null;
    }

    return (
        <div className="space-y-1 rounded-2xl border border-border bg-popover/95 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
            <div className="flex items-center justify-between gap-4 text-white">
                <span>Date</span>
                <span>{point.date}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <span>Activity / Value</span>
                <span>{formatNumber(point.value, "en-PH", 0)}</span>
            </div>
            {point.comparisonPrice !== null ? (
                <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-1 text-white/50">
                    <span>Compare</span>
                    <span>{formatCurrency(point.comparisonPrice)}</span>
                </div>
            ) : null}
        </div>
    );
}


function getDisclosureViewerState(item: Record<string, unknown>, fallbackCompanyName: string): DisclosureViewerState | null {
    const candidateUrls = [item.FileLink, item.Link].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    const url = candidateUrls[0];

    if (!url) {
        return null;
    }

    const externalUrl = typeof item.Link === "string" && item.Link.trim().length > 0 ? item.Link : url;

    return {
        title: String(item["Report Type"] ?? item.report_type ?? "Disclosure"),
        companyName: String(item["Company Name"] ?? item.company_name ?? fallbackCompanyName),
        url,
        externalUrl,
    };
}

function getNewsSourceUrl(item: Record<string, unknown>) {
    const candidateUrls = [item.url, item.link, item.article_url, item.externalUrl, item.external_url, item.Link, item.URL].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
    );

    return candidateUrls[0] ?? null;
}

function FinancialReportBlock({
    title,
    data,
}: {
    title: string;
    data: Record<string, unknown>;
}) {
    const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined);
    const metaEntries = entries.filter(([, value]) => !Array.isArray(value) && typeof value !== "object");
    const tableEntries = entries.filter(([, value]) => Array.isArray(value)) as [string, Record<string, unknown>[]][];
    const objectEntries = entries.filter(([, value]) => typeof value === "object" && !Array.isArray(value)) as [string, Record<string, unknown>][];

    const year = metaEntries.find(([key]) => key.toLowerCase().includes("year"))?.[1];
    const quarter = metaEntries.find(([key]) => key.toLowerCase().includes("quarter"))?.[1];
    const scaleFactor = metaEntries.find(([key]) => key.toLowerCase().includes("scale"))?.[1];

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{title}</p>
                    <p className="font-sans text-[16px] leading-[1.5] text-white/70">
                        {year ? `Year ${String(year)}` : ""}{year && quarter ? " / " : ""}{quarter ? `Quarter ${String(quarter)}` : ""}
                    </p>
                </div>
                {scaleFactor !== undefined ? (
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">
                        Scale {formatNumber(Number(scaleFactor), "en-PH", 0)}
                    </p>
                ) : null}
            </div>

            {metaEntries.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                    {metaEntries.map(([key, value]) => (
                        <div key={key} className="space-y-1 border border-border px-4 py-3">
                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{formatLabel(key)}</p>
                            <p className="text-right font-mono text-sm tabular-nums text-white">{formatStatementValue(value)}</p>
                        </div>
                    ))}
                </div>
            ) : null}

            {tableEntries.map(([key, rows]) => (
                <StatementTable key={key} title={formatLabel(key)} rows={rows} />
            ))}

            {objectEntries.length ? (
                <div className="space-y-2">
                    {objectEntries.map(([key, value]) => (
                        <div key={key} className="space-y-2 border border-border px-4 py-3">
                            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{formatLabel(key)}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {Object.entries(value).map(([nestedKey, nestedValue]) => (
                                    <div key={nestedKey} className="space-y-1">
                                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/55">{formatLabel(nestedKey)}</p>
                                        <p className="text-right font-mono text-sm tabular-nums text-white/70">{formatStatementValue(nestedValue)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function StatementTable({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
    if (!rows.length) return null;

    const headers = Array.from(
        rows.reduce((set, row) => {
            Object.keys(row).forEach((key) => set.add(key));
            return set;
        }, new Set<string>())
    );

    const valueHeaders = headers.filter((key) => key !== "Item");

    return (
        <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">{title}</p>
            <div className="overflow-x-auto [scrollbar-gutter:stable]">
                <table className="min-w-[520px] w-full border-collapse font-mono text-[12px] tabular-nums">
                    <thead>
                        <tr className="border-b border-white/10 text-white/60">
                            <th className="py-2 pr-4 text-left font-normal uppercase tracking-[1.4px]">Item</th>
                            {valueHeaders.map((header) => (
                                <th key={header} className="py-2 pl-4 text-right font-normal uppercase tracking-[1.4px]">
                                    {formatLabel(header)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b border-white/5 last:border-b-0">
                                <td className="py-2 pr-4 text-left text-white">{formatStatementValue(row.Item ?? row.item ?? "---")}</td>
                                {valueHeaders.map((header) => (
                                    <td key={header} className="py-2 pl-4 text-right text-white/70">
                                        {formatStatementValue(row[header])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function formatLabel(value: string) {
    return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatStatementValue(value: unknown) {
    if (value === null || value === undefined) return "---";
    if (typeof value === "number") return formatNumber(value, "en-PH", 2);
    return String(value);
}

function renderMetricValue(
    stockData: Record<string, unknown>,
    latestChart: { open?: number | null; high?: number | null; low?: number | null; close?: number | null; value?: number | null } | undefined,
    overviewPrice: number | null,
    key: string,
    fallbackLabel: string
) {
    if (key === "price") {
        return formatCurrency(overviewPrice);
    }

    if (key === "OPEN") {
        return formatNumber(latestChart?.open ?? null);
    }

    if (key === "HIGH") {
        return formatNumber(latestChart?.high ?? null);
    }

    if (key === "LOW") {
        return formatNumber(latestChart?.low ?? null);
    }

    if (key === "volume") {
        return formatNumber(toNumber(stockData["Volume"] ?? stockData["volume"]), "en-PH", 0);
    }

    const value = stockData[key] ?? stockData[key.replace(/ /g, "_")];

    if (value === null || value === undefined) {
        return "---";
    }

    if (typeof value === "number") {
        if (fallbackLabel.toLowerCase().includes("volume") || fallbackLabel.toLowerCase().includes("board")) {
            return formatNumber(value, "en-PH", 0);
        }

        return formatNumber(value);
    }

    return String(value);
}

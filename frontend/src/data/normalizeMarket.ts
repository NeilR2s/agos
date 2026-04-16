import { safeArray } from "@/lib/format";

export type MarketChartPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  value: number | null;
};

export type ForecastPoint = MarketChartPoint & {
  q_01?: number | null;
  q_05?: number | null;
  q_09?: number | null;
  kind: "historical" | "forecast";
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeMarketOverview = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const stockData = (record.stockData && typeof record.stockData === "object"
    ? record.stockData
    : {}) as Record<string, unknown>;

  return {
    companyName: typeof record.companyName === "string" ? record.companyName : "---",
    ticker: typeof record.stockTicker === "string"
      ? record.stockTicker
      : typeof record.ticker === "string"
        ? record.ticker
        : "---",
    price: toNumber(record.price) ?? toNumber(stockData["Last Traded Price"]),
    lastUpdated: typeof record.lastUpdated === "string" ? record.lastUpdated : null,
    stockData,
    dividends: safeArray<Record<string, unknown>>(record.dividends),
  };
};

export const normalizeMarketChart = (payload: unknown): MarketChartPoint[] => {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const rawRows = safeArray<Record<string, unknown>>(record.chartData ?? payload);

  return rawRows.map((row) => ({
    date: typeof row.CHART_DATE === "string" ? row.CHART_DATE : typeof row.date === "string" ? row.date : "---",
    open: toNumber(row.OPEN ?? row.open),
    high: toNumber(row.HIGH ?? row.high),
    low: toNumber(row.LOW ?? row.low),
    close: toNumber(row.CLOSE ?? row.close),
    value: toNumber(row.VALUE ?? row.value),
  }));
};

export const normalizeMacroData = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  return safeArray<Record<string, unknown>>(record.data ?? payload);
};

export const normalizeNewsData = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  return safeArray<Record<string, unknown>>(record.data ?? payload);
};

export const normalizePseData = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  return safeArray<Record<string, unknown>>(record.data ?? payload);
};

export const normalizeFinancialData = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  return safeArray<Record<string, unknown>>(record.financialData ?? payload);
};

export const normalizeFinancialReports = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return { yearly: null, quarterly: null };
  }

  const record = payload as Record<string, unknown>;
  const reports = (record.financialReports && typeof record.financialReports === "object"
    ? record.financialReports
    : {}) as Record<string, unknown>;

  return {
    yearly: (reports.yearly && typeof reports.yearly === "object" ? reports.yearly : null) as Record<string, unknown> | null,
    quarterly: (reports.quarterly && typeof reports.quarterly === "object" ? reports.quarterly : null) as Record<string, unknown> | null,
  };
};

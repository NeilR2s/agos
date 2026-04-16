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

export type PortfolioRecord = {
  userId: string;
  holdings: HoldingRow[];
  liquidCash: number;
  totalMarketValue: number;
  totalPortfolioValue: number;
  totalGainLoss: number | null;
  totalGainLossPercent: number | null;
};

export type CashRecord = {
  amount: number;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toNullableNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeHolding = (holding: Record<string, unknown>): HoldingRow => ({
  id: String(holding.id ?? `${holding.userId ?? "user"}_${holding.ticker ?? "holding"}`),
  userId: String(holding.userId ?? ""),
  ticker: String(holding.ticker ?? ""),
  shares: toNumber(holding.shares),
  avgPrice: toNumber(holding.avgPrice),
  currentPrice:
    holding.currentPrice === null || holding.currentPrice === undefined
      ? null
      : toNumber(holding.currentPrice),
  marketValue:
    holding.marketValue === null || holding.marketValue === undefined
      ? null
      : toNumber(holding.marketValue),
  gainLoss:
    holding.gainLoss === null || holding.gainLoss === undefined
      ? null
      : toNumber(holding.gainLoss),
  gainLossPercent:
    holding.gainLossPercent === null || holding.gainLossPercent === undefined
      ? null
      : toNumber(holding.gainLossPercent),
});

export const normalizePortfolio = (payload: unknown): PortfolioRecord | null => {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const holdings = Array.isArray(record.holdings)
    ? record.holdings
        .filter((h): h is Record<string, unknown> => Boolean(h) && typeof h === "object")
        .map(normalizeHolding)
    : [];

  return {
    userId: String(record.userId ?? ""),
    holdings,
    liquidCash: toNumber(record.liquidCash),
    totalMarketValue: toNumber(record.totalMarketValue),
    totalPortfolioValue: toNumber(record.totalPortfolioValue),
    totalGainLoss: toNullableNumber(record.totalGainLoss),
    totalGainLossPercent: toNullableNumber(record.totalGainLossPercent),
  };
};

export const normalizeCash = (payload: unknown): CashRecord | null => {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  return {
    amount: toNumber(record.amount),
  };
};

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { backendClient } from "@/api/backend/client";
import { normalizePseData } from "@/data/normalizeMarket";

export type TickerCatalogItem = {
  ticker: string;
  companyName: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  date: string;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toString = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

export const useTickerCatalog = () => {
  const query = useQuery({
    queryKey: ["ticker-catalog"],
    queryFn: async () => {
      const { data, error } = await backendClient.GET("/api/v1/data/pse", {
        params: { query: { limit: 1000 } },
      });

      if (error) throw error;
      return normalizePseData(data);
    },
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo<TickerCatalogItem[]>(() => {
    const seen = new Map<string, TickerCatalogItem>();

    for (const row of query.data ?? []) {
      const ticker = toString(row.ticker ?? row.symbol ?? row.stockTicker, "").toUpperCase();

      if (!ticker || seen.has(ticker)) {
        continue;
      }

      seen.set(ticker, {
        ticker,
        companyName: toString(row.company_name ?? row.companyName ?? row.name, ticker),
        price: toNumber(row.close ?? row.price ?? row.last ?? null),
        changePct: toNumber(row.change_pct ?? row.changePct ?? row.percent_change ?? null),
        volume: toNumber(row.volume ?? row.Volume ?? null),
        marketCap: toNumber(row.market_cap ?? row.marketCap ?? null),
        date: toString(row.date ?? row.scraped_at ?? "---", "---"),
      });
    }

    return Array.from(seen.values()).sort((left, right) => left.ticker.localeCompare(right.ticker));
  }, [query.data]);

  return {
    ...query,
    items,
  };
};

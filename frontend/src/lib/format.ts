export function formatCurrency(
  value: number | null | undefined,
  currency = "PHP",
  locale = "en-PH"
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "---";
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  locale = "en-PH",
  maximumFractionDigits = 2
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "---";
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "---";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatSignedNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "---";
  }

  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

export function formatDate(value: string | number | Date | null | undefined) {
  if (!value) return "---";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function formatShortDate(value: string | number | Date | null | undefined) {
  if (!value) return "---";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

export function extractErrorMessage(error: unknown, fallback = "Request failed") {
  if (!error) return fallback;

  if (typeof error === "string") return error;

  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const err = error as Record<string, unknown>;
    const detail = err.detail;

    if (typeof detail === "string") return detail;

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as Record<string, unknown>;
      if (typeof first?.msg === "string") return first.msg;
    }

    if (typeof err.message === "string") return err.message;
  }

  return fallback;
}

export function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function formatDurationMs(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "---";
  }

  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export type EngineHealth = {
  status: string;
  version: string;
  model: string;
};

export type TradeDecision = {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  quantity: number;
  target_price?: number | null;
  is_approved: boolean;
  ai_signal: {
    action: "BUY" | "SELL" | "HOLD";
    confidence_score: number;
    reasoning: string;
  };
  rule_gate_reasoning: string;
    portfolio_impact?: Record<string, unknown> | null;
    trace?: Array<{
        title: string;
        status: string;
        detail: string;
        metrics?: Record<string, unknown> | null;
    }> | null;
    latency_ms?: number | null;
};


const toString = (value: unknown, fallback = "---") =>
  typeof value === "string" && value.trim() ? value : fallback;

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

export const normalizeEngineHealth = (payload: unknown): EngineHealth => {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  return {
    status: toString(record.status, "CHECKING"),
    version: toString(record.version),
    model: toString(record.model),
  };
};

export const normalizeTradeDecision = (payload: unknown): TradeDecision | null => {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const signal = (record.ai_signal && typeof record.ai_signal === "object"
    ? record.ai_signal
    : {}) as Record<string, unknown>;
  const trace = Array.isArray(record.trace)
    ? record.trace
        .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object")
        .map((step) => ({
          title: toString(step.title, "Step"),
          status: toString(step.status, "info"),
          detail: toString(step.detail, "---"),
          metrics: step.metrics && typeof step.metrics === "object"
            ? (step.metrics as Record<string, unknown>)
            : null,
        }))
    : null;

  return {
    ticker: toString(record.ticker),
    action: (record.action === "BUY" || record.action === "SELL" || record.action === "HOLD") ? record.action : "HOLD",
    quantity: toNumber(record.quantity),
    target_price: record.target_price === null || record.target_price === undefined ? null : toNumber(record.target_price, 0),
    is_approved: Boolean(record.is_approved),
    ai_signal: {
      action: (signal.action === "BUY" || signal.action === "SELL" || signal.action === "HOLD") ? signal.action : "HOLD",
      confidence_score: toNumber(signal.confidence_score),
      reasoning: toString(signal.reasoning, ""),
    },
    rule_gate_reasoning: toString(record.rule_gate_reasoning, ""),
        portfolio_impact: (record.portfolio_impact && typeof record.portfolio_impact === "object")
            ? (record.portfolio_impact as Record<string, unknown>)
            : null,
        trace,
        latency_ms: record.latency_ms === null || record.latency_ms === undefined ? null : toNumber(record.latency_ms),
    };
};


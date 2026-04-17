import type { AgentSSEEvent, Citation } from "@/features/agent/types";
import { humanizeAgentError } from "@/features/agent/lib/errors";

export type AgentTraceBucket = {
  agentId: string;
  label: string;
  role: string;
  status: "idle" | "running" | "completed" | "error";
  summary: string | null;
  toolCount: number;
  citationCount: number;
  events: AgentSSEEvent[];
  citations: Citation[];
};

const dedupeCitations = (citations: Citation[]) => {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.source}:${citation.label}:${citation.href ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const fallbackAgentId = "agos-runtime";

export function summarizeEvent(event: AgentSSEEvent) {
  const detail = event.data.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();

  const summary = event.data.summary;
  if (typeof summary === "string" && summary.trim()) {
    if (event.type === "agent.completed" && event.data.status === "error") {
      return humanizeAgentError(summary) ?? summary.trim();
    }
    return summary.trim();
  }

  const error = event.data.error;
  if (typeof error === "string" && error.trim()) return humanizeAgentError(error) ?? error.trim();

  const delta = event.data.delta;
  if (typeof delta === "string" && delta.trim()) return delta.trim();

  const name = event.data.name;
  if (typeof name === "string" && name.trim()) return humanizeToolName(name);

  return humanizeEventType(event.type);
}

export function humanizeEventType(type: string) {
  switch (type) {
    case "agent.started":
      return "Agent engaged";
    case "agent.completed":
      return "Agent completed";
    case "reasoning.step":
      return "Reasoning update";
    case "tool.started":
      return "Tool started";
    case "tool.completed":
      return "Tool completed";
    case "tool.error":
      return "Tool error";
    case "citation.added":
      return "Source captured";
    case "message.delta":
      return "Streaming response";
    case "synthesis.completed":
      return "Synthesis ready";
    default:
      return type.replace(/[._]/g, " ");
  }
}

export function humanizeToolName(name: string) {
  switch (name) {
    case "google_search":
      return "Web search";
    case "code_execution":
    case "code_interpreter":
      return "Code interpreter";
    case "url_context":
      return "URL context";
    case "get_portfolio_snapshot":
      return "Portfolio snapshot";
    case "get_portfolio_holding":
      return "Holding lookup";
    case "get_market_overview":
      return "Market overview";
    case "get_financial_data":
      return "Financial disclosures";
    case "get_financial_reports":
      return "Financial reports";
    case "get_latest_news":
      return "Latest news";
    case "get_latest_macro":
      return "Macro context";
    case "get_latest_pse_records":
      return "PSE records";
    case "search_user_threads":
      return "Thread history";
    case "evaluate_trade":
      return "Trade engine";
    default:
      return name.replace(/_/g, " ");
  }
}

export function describeEvent(event: AgentSSEEvent) {
  if (event.type === "tool.started") {
    const name = typeof event.data.name === "string" ? humanizeToolName(event.data.name) : "tool";
    return `${name} engaged${formatArgs(event)}.`;
  }

  if (event.type === "tool.completed") {
    const name = typeof event.data.name === "string" ? humanizeToolName(event.data.name) : "tool";
    const summary = typeof event.data.summary === "string" ? event.data.summary.trim() : "Completed successfully.";
    return `${name}: ${summary}`;
  }

  if (event.type === "tool.error") {
    const name = typeof event.data.name === "string" ? humanizeToolName(event.data.name) : "tool";
    const error =
      (typeof event.data.error === "string" ? humanizeAgentError(event.data.error) : null) ?? "Unknown error.";
    return `${name} failed: ${error}`;
  }

  if (event.type === "agent.completed") {
    const summary =
      typeof event.data.summary === "string"
        ? event.data.status === "error"
          ? (humanizeAgentError(event.data.summary) ?? event.data.summary.trim())
          : event.data.summary.trim()
        : "Completed.";
    return summary;
  }

  if (event.type === "citation.added") {
    const citation = event.data.citation as Citation | undefined;
    if (citation?.label) return `Source captured: ${citation.label}`;
  }

  return summarizeEvent(event);
}

function formatArgs(event: AgentSSEEvent) {
  const args = event.data.args;
  if (!args || typeof args !== "object") return "";
  const preview = Object.entries(args as Record<string, unknown>)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
  return preview ? ` (${preview})` : "";
}

export function buildAgentTraceBuckets(events: AgentSSEEvent[]) {
  const citationsByAgent = new Map<string, Citation[]>();
  const buckets = new Map<string, AgentTraceBucket>();

  for (const event of events) {
    const agentId = event.agentId ?? fallbackAgentId;
    const label = event.agentLabel ?? (agentId === fallbackAgentId ? "AGOS Runtime" : agentId);
    const role = event.agentRole ?? "runtime";
    const bucket = buckets.get(agentId) ?? {
      agentId,
      label,
      role,
      status: "running",
      summary: null,
      toolCount: 0,
      citationCount: 0,
      events: [],
      citations: [],
    };

    bucket.events.push(event);

    if (event.type === "tool.completed") {
      bucket.toolCount += 1;
    }

    if (event.type === "agent.completed") {
      const status = event.data.status;
      bucket.status = status === "error" ? "error" : "completed";
      if (typeof event.data.summary === "string") {
        bucket.summary = status === "error" ? (humanizeAgentError(event.data.summary) ?? event.data.summary) : event.data.summary;
      }
    }

    if (event.type === "tool.error") {
      bucket.status = "error";
      if (typeof event.data.error === "string") {
        bucket.summary = humanizeAgentError(event.data.error) ?? event.data.error;
      }
    }

    if (event.type === "citation.added" && event.data.citation && typeof event.data.citation === "object") {
      const next = citationsByAgent.get(agentId) ?? [];
      next.push(event.data.citation as Citation);
      citationsByAgent.set(agentId, next);
    }

    buckets.set(agentId, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const citations = dedupeCitations(citationsByAgent.get(bucket.agentId) ?? []);
      return {
        ...bucket,
        citations,
        citationCount: citations.length,
      };
    })
    .sort((left, right) => left.agentId.localeCompare(right.agentId));
}

export function pickDefaultAgentId(events: AgentSSEEvent[]) {
  const buckets = buildAgentTraceBuckets(events).filter((bucket) => bucket.agentId !== fallbackAgentId);
  return buckets[0]?.agentId ?? fallbackAgentId;
}

export function getWorkerSummarySnapshot(events: AgentSSEEvent[]) {
  const synthesis = [...events].reverse().find((event) => event.type === "synthesis.completed");
  const summaries = synthesis?.data.workerSummaries;
  return Array.isArray(summaries) ? summaries : [];
}

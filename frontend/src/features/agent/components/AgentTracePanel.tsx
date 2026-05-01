import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildAgentTraceBuckets, describeEvent, humanizeEventType } from "@/features/agent/lib/traces";
import type { AgentRun, AgentSSEEvent } from "@/features/agent/types";

type AgentTracePanelProps = {
  events: AgentSSEEvent[];
  run: AgentRun | null;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  streamNotice?: string | null;
};

type TraceFilter = "all" | "reasoning" | "tools" | "errors";

const traceFilters: Array<{ value: TraceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "reasoning", label: "Reasoning" },
  { value: "tools", label: "Tools" },
  { value: "errors", label: "Errors" },
];

export function AgentTracePanel({ events, run, selectedAgentId, onSelectAgent, streamNotice }: AgentTracePanelProps) {
  const [filter, setFilter] = useState<TraceFilter>("all");
  const buckets = useMemo(() => buildAgentTraceBuckets(events), [events]);
  const activeBucket = buckets.find((bucket) => bucket.agentId === selectedAgentId) ?? buckets[0] ?? null;
  const workerSummaries = useMemo(() => {
    const candidate = run?.usage?.workerSummaries;
    return Array.isArray(candidate) ? candidate : [];
  }, [run?.usage]);

  const activeEvents = useMemo(() => {
    const sourceEvents = activeBucket?.events.filter((event) => event.type !== "message.delta") ?? [];
    return sourceEvents.filter((event) => matchesTraceFilter(event, filter));
  }, [activeBucket?.events, filter]);
  const eventTotal = events.filter((event) => event.type !== "message.delta").length;
  const toolTotal = buckets.reduce((sum, bucket) => sum + bucket.toolCount, 0);
  const sourceTotal = buckets.reduce((sum, bucket) => sum + bucket.citationCount, 0);
  const completedWorkers = buckets.filter((bucket) => bucket.status === "completed").length;
  const erroredWorkers = buckets.filter((bucket) => bucket.status === "error").length;
  const progress = buckets.length ? Math.max(8, ((completedWorkers + erroredWorkers) / buckets.length) * 100) : 0;

  return (
    <Card size="sm" className="h-full min-h-0 bg-[#1b1f25]">
      <CardHeader className="border-b border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-mono text-[11px] uppercase tracking-[1.4px]">Agent Trace</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {traceFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                  filter === item.value
                    ? "border-white/20 bg-white/[0.06] text-white"
                    : "border-white/10 text-white/45 hover:border-white/20 hover:text-white"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 py-5">
        {streamNotice ? (
          <div className="border border-[#36536c] bg-[#1d2630] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-[#a9c4df]">Stream Notice</p>
            <p className="mt-2 font-sans text-[13px] leading-[1.6] text-white/80">{streamNotice}</p>
          </div>
        ) : null}

        <section className="border border-white/10 bg-[#171a20] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Selected Worker</p>
              <p className="mt-1 font-sans text-[17px] leading-[1.25] text-white">{activeBucket?.label ?? "No worker selected"}</p>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[1.2px] text-white/35">
              <span>{buckets.length} workers</span>
              <span>{eventTotal} events</span>
              <span>{toolTotal} tools</span>
              <span>{sourceTotal} sources</span>
            </div>
          </div>
          <div className="mt-4 h-[7px] border border-white/10 bg-[#0f1318]">
            <div className="h-full bg-white/35" style={{ width: `${progress}%` }} />
          </div>
        </section>

        {workerSummaries.length ? (
          <section className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Worker Summaries</p>
            <div className="grid gap-3 xl:grid-cols-2">
              {workerSummaries.map((summary, index) => {
                const agentId = typeof summary?.agentId === "string" ? summary.agentId : `summary-${index}`;
                const label = typeof summary?.label === "string" ? summary.label : agentId;
                const role = typeof summary?.role === "string" ? summary.role : "worker";
                const content = typeof summary?.summary === "string" ? summary.summary : "No summary emitted.";
                const toolCount = typeof summary?.toolCount === "number" ? summary.toolCount : 0;
                const isActive = agentId === activeBucket?.agentId;

                return (
                  <button
                    key={agentId}
                    type="button"
                    onClick={() => onSelectAgent(agentId)}
                    className={cn(
                      "border px-4 py-4 text-left transition-colors",
                      isActive ? "border-white/20 bg-white/[0.06]" : "border-white/10 hover:border-white/20 hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-white">{label}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-white/35">{role.replace(/-/g, " ")}</p>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-white/35">{toolCount} tools</span>
                    </div>
                    <p className="mt-3 line-clamp-3 font-sans text-[13px] leading-[1.6] text-white/75">{content}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 xl:min-h-0 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <section className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Workers & Runtime</p>
            {buckets.length ? (
              buckets.map((bucket) => (
                <button
                  key={bucket.agentId}
                  type="button"
                  onClick={() => onSelectAgent(bucket.agentId)}
                  className={cn(
                    "w-full border px-4 py-4 text-left transition-colors",
                    bucket.agentId === activeBucket?.agentId ? getActiveBucketTone(bucket.status) : getBucketTone(bucket.status)
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-white">{bucket.label}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">{bucket.role.replace(/-/g, " ")}</p>
                    </div>
                    <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px]", getStatusLabelTone(bucket.status))}>{bucket.status}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 font-sans text-[13px] leading-[1.6] text-white/75">{bucket.summary ?? "No summary yet."}</p>
                  <div className="mt-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[1.2px] text-white/35">
                    <span>{bucket.events.length} events</span>
                    <span>{bucket.toolCount} tools</span>
                    <span>{bucket.citationCount} sources</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/25">No trace emitted yet</p>
            )}
          </section>

          <section className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Timeline</p>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/25">{activeBucket?.label ?? "No agent selected"}</p>
            </div>
            {activeBucket ? (
              activeEvents.length ? (
                activeEvents.map((event) => (
                  <div key={`${event.sequence}-${event.type}`} className={cn("border px-4 py-4", getEventTone(event))}>
                    <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
                      <span>{String(event.sequence).padStart(2, "0")}</span>
                      <span>{humanizeEventType(event.type)}</span>
                    </div>
                    <p className="mt-3 font-sans text-[13px] leading-[1.6] text-white/80">{describeEvent(event)}</p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">{formatDate(event.timestamp)}</p>
                  </div>
                ))
              ) : (
                <p className="font-sans text-[14px] text-white/45">No events match the current filter for this agent.</p>
              )
            ) : (
              <p className="font-sans text-[14px] text-white/45">Select a run to inspect its persisted timeline.</p>
            )}
          </section>

          <section className="space-y-3 xl:col-span-2 xl:min-h-0 xl:max-h-[300px] xl:overflow-y-auto xl:pr-1 2xl:col-span-1 2xl:max-h-none 2xl:border-l 2xl:border-white/10 2xl:pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Sources</p>
            {activeBucket?.citations.length ? (
              activeBucket.citations.map((citation, index) => (
                <a
                  key={`${citation.source}-${citation.label}-${index}`}
                  href={citation.href ?? undefined}
                  target={citation.href ? "_blank" : undefined}
                  rel={citation.href ? "noreferrer" : undefined}
                  className="block border border-white/10 px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
                >
                  <p className="font-sans text-[13px] leading-[1.5] text-white">{citation.label}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">{citation.source}</p>
                  {citation.excerpt ? <p className="mt-2 font-sans text-[12px] leading-[1.5] text-white/55">{citation.excerpt}</p> : null}
                </a>
              ))
            ) : (
              <p className="font-sans text-[14px] text-white/45">No captured sources for this agent yet.</p>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function matchesTraceFilter(event: AgentSSEEvent, filter: TraceFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "reasoning") {
    return event.type === "agent.started" || event.type === "agent.completed" || event.type === "reasoning.step";
  }

  if (filter === "tools") {
    return event.type.startsWith("tool.") || event.type === "citation.added";
  }

  return event.type === "tool.error" || (event.type === "agent.completed" && event.data.status === "error");
}

function getBucketTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "border-[#5f3941] bg-[#281c21] hover:border-[#77474f] hover:bg-[#2d1f25]";
    case "running":
      return "border-[#36536c] bg-[#1d2630] hover:border-[#486c8b] hover:bg-[#212c37]";
    case "completed":
      return "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]";
    default:
      return "border-white/10 bg-transparent hover:border-white/20 hover:bg-white/[0.03]";
  }
}

function getActiveBucketTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "border-[#8b5862] bg-[#322229]";
    case "running":
      return "border-[#5a7f9f] bg-[#24313d]";
    default:
      return "border-white/20 bg-white/[0.05]";
  }
}

function getStatusLabelTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "text-[#d7a5ad]";
    case "running":
      return "text-[#a9c4df]";
    case "completed":
      return "text-white/55";
    default:
      return "text-white/45";
  }
}

function getEventTone(event: AgentSSEEvent) {
  if (event.type === "tool.error" || (event.type === "agent.completed" && event.data.status === "error")) {
    return "border-[#5f3941] bg-[#281c21]";
  }

  if (event.type === "agent.started" || event.type === "reasoning.step" || event.type === "tool.started") {
    return "border-[#36536c] bg-[#1d2630]";
  }

  return "border-white/10 bg-transparent";
}

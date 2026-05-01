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
    <Card size="sm" className="h-full min-h-0 bg-card">
      <CardHeader className="border-b border-border">
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
                    ? "border-ring/60 bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:border-ring/60 hover:text-foreground"
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
          <div className="rounded-2xl border border-chart-3/40 bg-chart-3/10 px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-chart-3">Stream Notice</p>
            <p className="mt-2 font-sans text-[13px] leading-[1.6] text-foreground/80">{streamNotice}</p>
          </div>
        ) : null}

        <section className="rounded-2xl border border-border bg-secondary/30 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Selected Worker</p>
              <p className="mt-1 font-sans text-[17px] leading-[1.25] text-foreground">{activeBucket?.label ?? "No worker selected"}</p>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
              <span>{buckets.length} workers</span>
              <span>{eventTotal} events</span>
              <span>{toolTotal} tools</span>
              <span>{sourceTotal} sources</span>
            </div>
          </div>
          <div className="mt-4 h-[7px] overflow-hidden rounded-full border border-border bg-background">
            <div className="h-full bg-chart-2/70" style={{ width: `${progress}%` }} />
          </div>
        </section>

        {workerSummaries.length ? (
          <section className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Worker Summaries</p>
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
                      "rounded-2xl border px-4 py-4 text-left transition-colors",
                      isActive ? "border-ring/60 bg-accent" : "border-border hover:border-ring/60 hover:bg-accent/70"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">{label}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{role.replace(/-/g, " ")}</p>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{toolCount} tools</span>
                    </div>
                    <p className="mt-3 line-clamp-3 font-sans text-[13px] leading-[1.6] text-foreground/75">{content}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 xl:min-h-0 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <section className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Workers & Runtime</p>
            {buckets.length ? (
              buckets.map((bucket) => (
                <button
                  key={bucket.agentId}
                  type="button"
                  onClick={() => onSelectAgent(bucket.agentId)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
                    bucket.agentId === activeBucket?.agentId ? getActiveBucketTone(bucket.status) : getBucketTone(bucket.status)
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">{bucket.label}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{bucket.role.replace(/-/g, " ")}</p>
                    </div>
                    <span className={cn("font-mono text-[10px] uppercase tracking-[1.4px]", getStatusLabelTone(bucket.status))}>{bucket.status}</span>
                  </div>
                  <p className="mt-3 line-clamp-3 font-sans text-[13px] leading-[1.6] text-foreground/75">{bucket.summary ?? "No summary yet."}</p>
                  <div className="mt-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
                    <span>{bucket.events.length} events</span>
                    <span>{bucket.toolCount} tools</span>
                    <span>{bucket.citationCount} sources</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No trace emitted yet</p>
            )}
          </section>

          <section className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Timeline</p>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">{activeBucket?.label ?? "No agent selected"}</p>
            </div>
            {activeBucket ? (
              activeEvents.length ? (
                activeEvents.map((event) => (
                  <div key={`${event.sequence}-${event.type}`} className={cn("rounded-2xl border px-4 py-4", getEventTone(event))}>
                    <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                      <span>{String(event.sequence).padStart(2, "0")}</span>
                      <span>{humanizeEventType(event.type)}</span>
                    </div>
                    <p className="mt-3 font-sans text-[13px] leading-[1.6] text-foreground/80">{describeEvent(event)}</p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">{formatDate(event.timestamp)}</p>
                  </div>
                ))
              ) : (
                <p className="font-sans text-[14px] text-muted-foreground">No events match the current filter for this agent.</p>
              )
            ) : (
              <p className="font-sans text-[14px] text-muted-foreground">Select a run to inspect its persisted timeline.</p>
            )}
          </section>

          <section className="space-y-3 xl:col-span-2 xl:min-h-0 xl:max-h-[300px] xl:overflow-y-auto xl:pr-1 2xl:col-span-1 2xl:max-h-none 2xl:border-l 2xl:border-border 2xl:pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Sources</p>
            {activeBucket?.citations.length ? (
              activeBucket.citations.map((citation, index) => (
                <a
                  key={`${citation.source}-${citation.label}-${index}`}
                  href={citation.href ?? undefined}
                  target={citation.href ? "_blank" : undefined}
                  rel={citation.href ? "noreferrer" : undefined}
                  className="block rounded-2xl border border-border px-4 py-4 transition-colors hover:border-ring/60 hover:bg-accent/70"
                >
                  <p className="font-sans text-[13px] leading-[1.5] text-foreground">{citation.label}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{citation.source}</p>
                  {citation.excerpt ? <p className="mt-2 font-sans text-[12px] leading-[1.5] text-muted-foreground">{citation.excerpt}</p> : null}
                </a>
              ))
            ) : (
              <p className="font-sans text-[14px] text-muted-foreground">No captured sources for this agent yet.</p>
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
      return "border-destructive/40 bg-destructive/10 hover:border-destructive/60 hover:bg-destructive/15";
    case "running":
      return "border-chart-3/40 bg-chart-3/10 hover:border-chart-3/60 hover:bg-chart-3/15";
    case "completed":
      return "border-border bg-secondary/20 hover:border-ring/60 hover:bg-accent/70";
    default:
      return "border-border bg-transparent hover:border-ring/60 hover:bg-accent/70";
  }
}

function getActiveBucketTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "border-destructive/60 bg-destructive/15";
    case "running":
      return "border-chart-3/60 bg-chart-3/15";
    default:
      return "border-ring/60 bg-accent";
  }
}

function getStatusLabelTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "text-destructive";
    case "running":
      return "text-chart-3";
    case "completed":
      return "text-chart-2";
    default:
      return "text-muted-foreground";
  }
}

function getEventTone(event: AgentSSEEvent) {
  if (event.type === "tool.error" || (event.type === "agent.completed" && event.data.status === "error")) {
    return "border-destructive/40 bg-destructive/10";
  }

  if (event.type === "agent.started" || event.type === "reasoning.step" || event.type === "tool.started") {
    return "border-chart-3/40 bg-chart-3/10";
  }

  return "border-border bg-transparent";
}

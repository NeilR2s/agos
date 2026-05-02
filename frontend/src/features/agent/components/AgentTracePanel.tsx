import { useMemo, useState } from "react";

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
  const workerBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.role !== "runtime" && bucket.role !== "synthesizer"),
    [buckets]
  );
  const countBuckets = workerBuckets.length ? workerBuckets : buckets;
  const activeBucket = buckets.find((bucket) => bucket.agentId === selectedAgentId) ?? countBuckets[0] ?? buckets[0] ?? null;
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
  const completedWorkers = countBuckets.filter((bucket) => bucket.status === "completed").length;
  const erroredWorkers = countBuckets.filter((bucket) => bucket.status === "error").length;
  const progress = countBuckets.length
    ? countBuckets.reduce((sum, bucket) => sum + getTraceProgress(bucket).value, 0) / countBuckets.length
    : 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[1.45px] text-muted-foreground">Agent Trace</p>
          <h3 className="mt-2 truncate font-sans text-[24px] leading-[1.15] tracking-[-0.035em] text-foreground">
            {activeBucket?.label ?? "No worker selected"}
          </h3>
          <p className="mt-2 max-w-[680px] font-sans text-[13px] leading-[1.6] text-muted-foreground">
            Inspect worker progress, filtered events, tool activity, and captured sources for this run.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-[1.25px] text-muted-foreground">
          <MetricPill label="Agents" value={String(countBuckets.length)} />
          <MetricPill label="Done" value={`${completedWorkers + erroredWorkers}/${countBuckets.length}`} />
          <MetricPill label="Events" value={String(eventTotal)} />
          <MetricPill label="Tools" value={String(toolTotal)} />
          <MetricPill label="Sources" value={String(sourceTotal)} />
          <MetricPill label="Progress" value={`${Math.round(progress)}%`} />
        </div>
      </div>

      {streamNotice ? (
        <div className="border-l border-chart-3/50 bg-chart-3/[0.04] px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-chart-3">Stream Notice</p>
          <p className="mt-2 font-sans text-[13px] leading-[1.6] text-foreground/80">{streamNotice}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-secondary/55">
          <div className="h-full bg-chart-1/80" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {traceFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                filter === item.value
                  ? "border-ring/60 bg-accent text-foreground"
                  : "border-border/70 text-muted-foreground hover:border-ring/60 hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)]">
        <section className="min-w-0 space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Workers</p>
          <div className="overflow-hidden rounded-[18px] border border-border/70 bg-background/20">
            {buckets.length ? (
              buckets.map((bucket, index) => {
                const isActive = bucket.agentId === activeBucket?.agentId;
                const progress = getTraceProgress(bucket);
                return (
                  <button
                    key={bucket.agentId}
                    type="button"
                    onClick={() => onSelectAgent(bucket.agentId)}
                    className={cn(
                      "w-full border-b border-border/55 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/35",
                      isActive && "bg-accent/45"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[10px] uppercase tracking-[1.3px] text-foreground/85">Agent {String(index + 1).padStart(2, "0")}</p>
                        <p className="mt-1 truncate font-sans text-[13px] leading-[1.3] text-foreground/80">{bucket.label}</p>
                      </div>
                      <span className={cn("shrink-0 font-mono text-[9px] uppercase tracking-[1.2px]", getStatusLabelTone(bucket.status))}>{bucket.status}</span>
                    </div>
                    <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-secondary/65">
                      <div className={cn("h-full", getProgressTone(bucket.status))} style={{ width: `${progress.value}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-[1.15px] text-muted-foreground/75">
                      <span className="truncate">{bucket.role.replace(/-/g, " ")}</span>
                      <span>{progress.stage}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No trace emitted yet</p>
            )}
          </div>
        </section>

        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Timeline</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">{activeBucket?.label ?? "No agent selected"}</p>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-border/70 bg-background/20">
            {activeBucket ? (
              activeEvents.length ? (
                activeEvents.map((event) => (
                  <div key={`${event.sequence}-${event.type}`} className="grid gap-3 border-b border-border/55 px-4 py-3 last:border-b-0 md:grid-cols-[112px_minmax(0,1fr)]">
                    <div className="font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground">
                      <p>{String(event.sequence).padStart(2, "0")}</p>
                      <p className={cn("mt-1", getEventLabelTone(event))}>{humanizeEventType(event.type)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-sans text-[13px] leading-[1.6] text-foreground/82">{describeEvent(event)}</p>
                      <p className="mt-1 font-mono text-[9px] uppercase tracking-[1.25px] text-muted-foreground/55">{formatDate(event.timestamp)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-4 py-4 font-sans text-[14px] text-muted-foreground">No events match the current filter for this agent.</p>
              )
            ) : (
              <p className="px-4 py-4 font-sans text-[14px] text-muted-foreground">Select a run to inspect its persisted timeline.</p>
            )}
          </div>
        </section>
      </div>

      {workerSummaries.length ? (
        <section className="space-y-2 border-t border-border/60 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Worker Summaries</p>
          <div className="grid gap-2 lg:grid-cols-2">
            {workerSummaries.map((summary, index) => {
              const agentId = typeof summary?.agentId === "string" ? summary.agentId : `summary-${index}`;
              const label = typeof summary?.label === "string" ? summary.label : agentId;
              const role = typeof summary?.role === "string" ? summary.role : "worker";
              const content = typeof summary?.summary === "string" ? summary.summary : "No summary emitted.";
              const toolCount = typeof summary?.toolCount === "number" ? summary.toolCount : 0;
              return (
                <button
                  key={agentId}
                  type="button"
                  onClick={() => onSelectAgent(agentId)}
                  className="border-l border-border/70 px-3 py-2 text-left transition-colors hover:border-ring/60 hover:bg-accent/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-[10px] uppercase tracking-[1.3px] text-foreground/80">{label}</p>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground">{toolCount} tools</span>
                  </div>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/70">{role.replace(/-/g, " ")}</p>
                  <p className="mt-2 line-clamp-2 font-sans text-[12px] leading-[1.55] text-foreground/70">{content}</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-2 border-t border-border/60 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Sources</p>
        {activeBucket?.citations.length ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {activeBucket.citations.map((citation, index) => (
              <a
                key={`${citation.source}-${citation.label}-${index}`}
                href={citation.href ?? undefined}
                target={citation.href ? "_blank" : undefined}
                rel={citation.href ? "noreferrer" : undefined}
                className="border-l border-border/70 px-3 py-2 transition-colors hover:border-ring/60 hover:bg-accent/25"
              >
                <p className="font-sans text-[13px] leading-[1.5] text-foreground/82">{citation.label}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{citation.source}</p>
                {citation.excerpt ? <p className="mt-2 line-clamp-2 font-sans text-[12px] leading-[1.5] text-muted-foreground">{citation.excerpt}</p> : null}
              </a>
            ))}
          </div>
        ) : (
          <p className="font-sans text-[14px] text-muted-foreground">No captured sources for this agent yet.</p>
        )}
      </section>
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border/70 bg-secondary/20 px-2.5 py-1">
      {label} {value}
    </span>
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

function getTraceProgress(bucket: ReturnType<typeof buildAgentTraceBuckets>[number]) {
  if (bucket.status === "completed" || bucket.status === "error") {
    return { value: 100, stage: bucket.status === "error" ? "error" : "complete" };
  }

  const pass = bucket.events.reduce((maxPass, event) => {
    const title = typeof event.data.title === "string" ? event.data.title : "";
    const detail = typeof event.data.detail === "string" ? event.data.detail : "";
    const match = `${title} ${detail}`.match(/pass\s+(\d+)/i);
    return match ? Math.max(maxPass, Number(match[1])) : maxPass;
  }, 0);
  const started = bucket.events.some((event) => event.type === "agent.started");
  const toolStartedCount = bucket.events.filter((event) => event.type === "tool.started").length;
  const pendingToolCount = Math.max(0, toolStartedCount - bucket.toolCount);
  const value = Math.min(92, Math.max(started ? 14 : 6, (pass ? 14 + (Math.min(pass, 6) / 6) * 66 : 14) + bucket.toolCount * 4 + pendingToolCount * 2 + bucket.citationCount * 2));
  const latest = [...bucket.events].reverse().find((event) => event.type !== "message.delta");

  if (latest?.type === "tool.started") {
    return { value, stage: "tooling" };
  }

  if (pass) {
    return { value, stage: `pass ${Math.min(pass, 6)}/6` };
  }

  return { value, stage: started ? "starting" : "queued" };
}

function getProgressTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "bg-destructive/80";
    case "completed":
      return "bg-chart-2/80";
    case "running":
      return "bg-chart-1/80";
    default:
      return "bg-foreground/35";
  }
}

function getStatusLabelTone(status: "idle" | "running" | "completed" | "error") {
  switch (status) {
    case "error":
      return "text-destructive";
    case "running":
      return "text-chart-1";
    case "completed":
      return "text-chart-2";
    default:
      return "text-muted-foreground";
  }
}

function getEventLabelTone(event: AgentSSEEvent) {
  if (event.type === "tool.error" || (event.type === "agent.completed" && event.data.status === "error")) {
    return "text-destructive";
  }

  if (event.type === "agent.started" || event.type === "reasoning.step" || event.type === "tool.started") {
    return "text-chart-1";
  }

  if (event.type === "agent.completed" || event.type === "tool.completed") {
    return "text-chart-2";
  }

  return "text-muted-foreground/75";
}

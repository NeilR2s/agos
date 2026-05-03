import { useMemo, useState } from "react";

import { buildAgentTraceBuckets, describeEvent, stripMarkdownArtifacts } from "@/features/agent/lib/traces";
import type { AgentRun, AgentSSEEvent } from "@/features/agent/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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

  const visibleEvents = useMemo(() => {
    const sourceEvents = events.filter((event) => event.type !== "message.delta");
    return sourceEvents.filter((event) => matchesTraceFilter(event, filter));
  }, [events, filter]);

  const eventTotal = events.filter((event) => event.type !== "message.delta").length;
  const toolTotal = buckets.reduce((sum, bucket) => sum + bucket.toolCount, 0);
  const sourceTotal = buckets.reduce((sum, bucket) => sum + bucket.citationCount, 0);
  const completedWorkers = countBuckets.filter((bucket) => bucket.status === "completed").length;
  const erroredWorkers = countBuckets.filter((bucket) => bucket.status === "error").length;
  const progress = countBuckets.length
    ? countBuckets.reduce((sum, bucket) => sum + getTraceProgress(bucket).value, 0) / countBuckets.length
    : 0;
  const runStart = events[0]?.timestamp ?? run?.startedAt ?? null;

  return (
    <section className="space-y-6">
      <div className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[1.45px] text-muted-foreground">Agent Trace</p>
            <h3 className="mt-2 truncate font-sans text-[21px] font-medium leading-[1.15] tracking-[-0.03em] text-foreground">
              {activeBucket?.label ?? "No worker selected"}
            </h3>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.25px] text-muted-foreground/70">
              {countBuckets.length} agents · {completedWorkers + erroredWorkers}/{countBuckets.length || 0} resolved · {eventTotal} events · {toolTotal} tools · {sourceTotal} sources · {Math.round(progress)}%
            </p>
          </div>

          <div className="flex w-full max-w-[440px] flex-col gap-2 xl:items-end">
            <div className="h-px w-full bg-secondary/70">
              <div className="h-px bg-chart-1" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
            <div className="inline-flex w-fit overflow-hidden rounded-full border border-border/70 bg-secondary/20 p-0.5">
              {traceFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.2px] transition-colors",
                    filter === item.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {streamNotice ? (
          <div className="mt-4 border-l border-chart-3/50 px-3 py-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-chart-3">Stream Notice</p>
            <p className="mt-1 font-sans text-[13px] leading-[1.6] text-foreground/78">{streamNotice}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <section className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Agents</p>
          <div className="mt-2 border-y border-border/60">
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
                      "grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-3 border-b border-border/50 py-3 pr-2 text-left transition-colors last:border-b-0 hover:bg-accent/25",
                      isActive && "bg-accent/35"
                    )}
                  >
                    <span className={cn("mt-0.5 h-full min-h-8 border-l", isActive ? "border-[#ff5f1f]" : "border-border/50")} />
                    <span className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[1.3px] text-muted-foreground/60">{String(index + 1).padStart(2, "0")}</span>
                        <span className={cn("shrink-0 font-mono text-[9px] uppercase tracking-[1.2px]", getStatusLabelTone(bucket.status))}>{bucket.status}</span>
                      </div>
                      <span className={cn(
                        "mt-1 block truncate font-sans text-[13px] leading-none",
                        isActive ? "text-foreground" : "text-muted-foreground/80"
                      )}>{bucket.label}</span>
                      {isActive && (
                        <span className="mt-2 block truncate font-mono text-[9px] uppercase tracking-[1.15px] text-muted-foreground/60">
                          {bucket.role.replace(/-/g, " ")} · {progress.stage} · {bucket.toolCount} tools
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="py-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No trace emitted yet</p>
            )}
          </div>
        </section>

        <section className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Event Trace</p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/65">All agents · selected {activeBucket?.label ?? "none"}</p>
          </div>
          <div className="mt-2 overflow-hidden border-y border-border/60">
            {events.length ? (
              visibleEvents.length ? (
                <table className="w-full table-fixed border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border/60">
                      {[
                        ["Time", "w-[72px] text-right sm:w-[90px]"],
                        ["Agent", "w-[120px] sm:w-[170px]"],
                        ["Event", "w-[118px] sm:w-[148px]"],
                        ["Detail", ""],
                      ].map(([label, className]) => (
                        <th key={label} className={cn("break-words px-2 py-2 font-mono text-[10px] uppercase tracking-[1.25px] text-muted-foreground/70 sm:px-3", className)}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEvents.map((event) => {
                      const eventAgentId = event.agentId ?? "agos-runtime";
                      const isSelectedAgent = eventAgentId === activeBucket?.agentId;
                      const detail = stripMarkdownArtifacts(describeEvent(event));
                      return (
                        <tr key={`${event.sequence}-${event.type}`} className={cn("border-b border-border/45 last:border-b-0 hover:bg-accent/20", isSelectedAgent && "bg-accent/15")}>
                          <td className="px-2 py-3 text-right font-mono text-[10px] tracking-[1.15px] text-muted-foreground/50 sm:px-3" title={formatDate(event.timestamp)}>
                            {formatElapsed(runStart, event.timestamp, event.sequence)}
                          </td>
                          <td className="px-2 py-3 font-sans text-[13px] leading-[1.45] text-foreground/82 sm:px-3">
                            <span className="line-clamp-2 break-words">{stripMarkdownArtifacts(event.agentLabel ?? eventAgentId)}</span>
                          </td>
                          <td className="px-2 py-3 font-mono text-[10px] uppercase tracking-[1.2px] sm:px-3">
                            <span className={getEventLabelTone(event)}>{event.type.replace(/_/g, ".")}</span>
                          </td>
                          <td className="break-words px-2 py-3 font-sans text-[13px] leading-[1.55] text-foreground/78 sm:px-3">{detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-4 font-sans text-[14px] text-muted-foreground">No events match the current filter.</p>
              )
            ) : (
              <p className="px-3 py-4 font-sans text-[14px] text-muted-foreground">Select a run to inspect its persisted timeline.</p>
            )}
          </div>
        </section>
      </div>

      {workerSummaries.length ? (
        <section className="border-t border-border/60 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Worker Summaries</p>
          <div className="mt-2 divide-y divide-border/55 border-y border-border/60">
            {workerSummaries.map((summary, index) => {
              const agentId = typeof summary?.agentId === "string" ? summary.agentId : `summary-${index}`;
              const label = typeof summary?.label === "string" ? summary.label : agentId;
              const role = typeof summary?.role === "string" ? summary.role : "worker";
              const content = typeof summary?.summary === "string" ? stripMarkdownArtifacts(summary.summary) : "No summary emitted.";
              const toolCount = typeof summary?.toolCount === "number" ? summary.toolCount : 0;
              return (
                <button
                  key={agentId}
                  type="button"
                  onClick={() => onSelectAgent(agentId)}
                  className="grid w-full gap-2 py-3 text-left transition-colors hover:bg-accent/20 md:grid-cols-[210px_minmax(0,1fr)_90px] md:items-start"
                >
                  <div className="min-w-0 px-3">
                    <p className="truncate font-sans text-[13px] leading-[1.35] text-foreground/86">{stripMarkdownArtifacts(label)}</p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/65">{role.replace(/-/g, " ")}</p>
                  </div>
                  <p className="line-clamp-2 break-words px-3 font-sans text-[12px] leading-[1.55] text-foreground/68">{content}</p>
                  <p className="px-3 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/70 md:text-right">{toolCount} tools</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="border-t border-border/60 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Sources</p>
        {activeBucket?.citations.length ? (
          <div className="mt-2 divide-y divide-border/55 border-y border-border/60">
            {activeBucket.citations.map((citation, index) => (
              <a
                key={`${citation.source}-${citation.label}-${index}`}
                href={citation.href ?? undefined}
                target={citation.href ? "_blank" : undefined}
                rel={citation.href ? "noreferrer" : undefined}
                className="grid gap-2 px-3 py-3 transition-colors hover:bg-accent/20 md:grid-cols-[minmax(0,1fr)_160px]"
              >
                <span className="min-w-0">
                  <span className="block break-words font-sans text-[13px] leading-[1.5] text-foreground/82">{stripMarkdownArtifacts(citation.label)}</span>
                  {citation.excerpt ? <span className="mt-1 line-clamp-2 block break-words font-sans text-[12px] leading-[1.5] text-muted-foreground">{stripMarkdownArtifacts(citation.excerpt)}</span> : null}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground md:text-right">{citation.source}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-sans text-[14px] text-muted-foreground">No captured sources for this agent yet.</p>
        )}
      </section>
    </section>
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

function formatElapsed(startedAt: string | null, timestamp: string, sequence: number) {
  const start = new Date(startedAt ?? "");
  const current = new Date(timestamp);

  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) {
    return String(sequence).padStart(2, "0");
  }

  const totalSeconds = Math.max(0, Math.round((current.getTime() - start.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

  if (event.type === "agent.started" || event.type === "tool.started") {
    return "text-[#ff5f1f]";
  }

  return "text-muted-foreground/50";
}

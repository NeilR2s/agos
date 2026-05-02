import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { buildAgentTraceBuckets, describeEvent } from "@/features/agent/lib/traces";
import type { AgentSSEEvent } from "@/features/agent/types";

type AgentWorkingTraceProps = {
  events: AgentSSEEvent[];
  isStreaming: boolean;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
};

export function AgentWorkingTrace({ events, isStreaming, selectedAgentId, onSelectAgent }: AgentWorkingTraceProps) {
  const [expanded, setExpanded] = useState(false);
  const buckets = useMemo(() => buildAgentTraceBuckets(events), [events]);
  const workerBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.role !== "runtime" && bucket.role !== "synthesizer"),
    [buckets]
  );

  if (!buckets.length) {
    return null;
  }

  const countBuckets = workerBuckets.length ? workerBuckets : buckets;
  const activeCount = countBuckets.filter((bucket) => bucket.status === "running").length;
  const completedCount = countBuckets.filter((bucket) => bucket.status === "completed").length;
  const errorCount = countBuckets.filter((bucket) => bucket.status === "error").length;
  const resolvedCount = completedCount + errorCount;
  const toolTotal = buckets.reduce((sum, bucket) => sum + bucket.toolCount, 0);
  const sourceTotal = buckets.reduce((sum, bucket) => sum + bucket.citationCount, 0);
  const progress = countBuckets.length ? Math.max(8, (resolvedCount / countBuckets.length) * 100) : 0;
  const duration = formatTraceDuration(events, isStreaming);
  const title = isStreaming ? "Running" : errorCount ? "Completed With Errors" : "Completed";

  return (
    <div className="overflow-hidden rounded-[20px] border border-border/70 bg-card/35">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-accent/50 md:px-5"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  isStreaming ? "bg-chart-3" : errorCount ? "bg-destructive" : "bg-chart-2"
                )}
              />
              <p className="font-sans text-[15px] font-medium text-foreground">{title}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                <span>{countBuckets.length} total workers</span>
                {duration ? <span>{duration}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">
              <span>{isStreaming ? `${activeCount || countBuckets.length} live` : `${completedCount} complete`}</span>
              <span>{errorCount} errors</span>
              <span>{toolTotal} tools</span>
              <span>{sourceTotal} sources</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 self-end md:self-auto">
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
              {resolvedCount}/{countBuckets.length}
            </span>
            {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="relative h-[4px] overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                "absolute inset-y-0 left-0",
                 isStreaming ? "bg-chart-3" : errorCount ? "bg-destructive" : "bg-chart-2"
              )}
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute inset-0 opacity-35"
              style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 7px, color-mix(in oklch, var(--foreground) 24%, transparent) 7px 8px)" }}
            />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">
            {isStreaming ? "Live operations trace" : "Completed operations trace"} / expand for worker detail
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border/70">
          {buckets.map((bucket) => {
            const latest = bucket.events[bucket.events.length - 1];
            const isSelected = bucket.agentId === selectedAgentId;
            const highlights = bucket.events
              .filter((event) => event.type !== "message.delta")
              .slice(-2)
              .map((event) => describeEvent(event));

            return (
              <button
                key={bucket.agentId}
                type="button"
                onClick={() => onSelectAgent(bucket.agentId)}
                className={cn(
                  "grid w-full gap-3 border-b border-l-2 border-b-border/60 px-4 py-3 text-left transition-colors last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start md:px-5",
                  getBucketRowTone(bucket.status, isSelected)
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">{bucket.label}</p>
                  <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{bucket.role.replace(/-/g, " ")}</p>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="line-clamp-2 font-sans text-[13px] leading-[1.55] text-foreground/80">
                    {bucket.summary ?? (latest ? describeEvent(latest) : "Awaiting trace output.")}
                  </p>
                  {highlights.length ? (
                    <div className="space-y-1">
                      {highlights.map((highlight, index) => (
                        <p key={`${bucket.agentId}-${index}`} className="line-clamp-1 font-sans text-[12px] leading-[1.45] text-muted-foreground">
                          {highlight}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground md:justify-end">
                  <span className={cn(bucket.status === "error" && "text-destructive", bucket.status === "completed" && "text-chart-2", bucket.status === "running" && "text-chart-3")}>{bucket.status}</span>
                  <span>{bucket.toolCount}t</span>
                  <span>{bucket.citationCount}s</span>
                  <span>{bucket.events.length}e</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getBucketRowTone(status: "idle" | "running" | "completed" | "error", isSelected: boolean) {
  if (status === "error") {
    return isSelected
      ? "border-l-destructive bg-destructive/10"
      : "border-l-destructive/70 bg-destructive/5 hover:bg-destructive/10";
  }

  if (status === "running") {
    return isSelected
      ? "border-l-chart-3 bg-chart-3/10"
      : "border-l-chart-3/70 bg-chart-3/5 hover:bg-chart-3/10";
  }

  return isSelected
    ? "border-l-ring bg-accent/70"
    : "border-l-border bg-transparent hover:bg-accent/50";
}

function formatTraceDuration(events: AgentSSEEvent[], isStreaming: boolean) {
  const startedAt = new Date(events[0]?.timestamp ?? "");
  if (Number.isNaN(startedAt.getTime())) {
    return null;
  }

  const endedAt = isStreaming ? new Date() : new Date(events[events.length - 1]?.timestamp ?? "");
  if (Number.isNaN(endedAt.getTime())) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

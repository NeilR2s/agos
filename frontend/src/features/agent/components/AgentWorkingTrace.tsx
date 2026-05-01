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
  const [expanded, setExpanded] = useState(isStreaming);
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card/90">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-accent/70"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  isStreaming ? "bg-chart-3" : errorCount ? "bg-destructive" : "bg-chart-2"
                )}
              />
              <p className="font-sans text-[15px] font-medium text-foreground">{title}</p>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
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
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
              {resolvedCount}/{countBuckets.length}
            </span>
            {expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="relative h-[8px] overflow-hidden rounded-full border border-border bg-background">
            <div
              className={cn(
                "absolute inset-y-0 left-0",
                 isStreaming ? "bg-chart-3" : errorCount ? "bg-destructive" : "bg-chart-2"
              )}
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute inset-0 opacity-30"
              style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 5px, color-mix(in oklch, var(--foreground) 18%, transparent) 5px 6px)" }}
            />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">
            {isStreaming ? "Live trace" : "Completed trace"} / click a worker for its breakdown
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="grid gap-3 border-t border-border p-4 md:grid-cols-2 2xl:grid-cols-3">
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
                  "space-y-3 rounded-2xl border px-4 py-4 text-left transition-colors",
                  getBucketTone(bucket.status, isSelected)
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">{bucket.label}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{bucket.role.replace(/-/g, " ")}</p>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-[1.4px]",
                      bucket.status === "error" && "text-destructive",
                      bucket.status === "completed" && "text-chart-2",
                      bucket.status === "running" && "text-chart-3"
                    )}
                  >
                    {bucket.status}
                  </span>
                </div>
                <p className="line-clamp-3 font-sans text-[14px] leading-[1.6] text-foreground/80">
                  {bucket.summary ?? (latest ? describeEvent(latest) : "Awaiting trace output.")}
                </p>
                {highlights.length ? (
                  <div className="space-y-1.5">
                    {highlights.map((highlight, index) => (
                      <p key={`${bucket.agentId}-${index}`} className="line-clamp-1 font-sans text-[12px] leading-[1.5] text-muted-foreground">
                        {highlight}
                      </p>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
                  <span>{bucket.toolCount} tools</span>
                  <span>{bucket.citationCount} sources</span>
                  <span>{bucket.events.length} events</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getBucketTone(status: "idle" | "running" | "completed" | "error", isSelected: boolean) {
  if (status === "error") {
    return isSelected
      ? "border-destructive/60 bg-destructive/15"
      : "border-destructive/40 bg-destructive/10 hover:bg-destructive/15";
  }

  if (status === "running") {
    return isSelected
      ? "border-chart-3/60 bg-chart-3/15"
      : "border-chart-3/40 bg-chart-3/10 hover:bg-chart-3/15";
  }

  return isSelected
    ? "border-ring/60 bg-accent"
    : "border-border bg-secondary/20 hover:bg-accent/70";
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

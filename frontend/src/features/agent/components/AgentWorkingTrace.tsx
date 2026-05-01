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
    <div className="overflow-hidden border border-white/10 bg-[#14181e]">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  isStreaming ? "bg-[#6d9ac0]" : errorCount ? "bg-[#a16f77]" : "bg-[#6e9973]"
                )}
              />
              <p className="font-sans text-[15px] font-medium text-white">{title}</p>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
                <span>{countBuckets.length} total workers</span>
                {duration ? <span>{duration}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/28">
              <span>{isStreaming ? `${activeCount || countBuckets.length} live` : `${completedCount} complete`}</span>
              <span>{errorCount} errors</span>
              <span>{toolTotal} tools</span>
              <span>{sourceTotal} sources</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
              {resolvedCount}/{countBuckets.length}
            </span>
            {expanded ? <ChevronDown className="size-4 text-white/40" /> : <ChevronRight className="size-4 text-white/40" />}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="relative h-[8px] overflow-hidden border border-white/10 bg-[#0f1318]">
            <div
              className={cn(
                "absolute inset-y-0 left-0",
                isStreaming ? "bg-[#486c8b]" : errorCount ? "bg-[#7a535b]" : "bg-[#5c7c61]"
              )}
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute inset-0 opacity-30"
              style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 5px, rgba(255,255,255,0.18) 5px 6px)" }}
            />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
            {isStreaming ? "Live trace" : "Completed trace"} / click a worker for its breakdown
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-2 2xl:grid-cols-3">
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
                  "space-y-3 border px-4 py-4 text-left transition-colors",
                  getBucketTone(bucket.status, isSelected)
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[1.4px] text-white">{bucket.label}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">{bucket.role.replace(/-/g, " ")}</p>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-[1.4px]",
                      bucket.status === "error" && "text-[#d7a5ad]",
                      bucket.status === "completed" && "text-white/50",
                      bucket.status === "running" && "text-[#a9c4df]"
                    )}
                  >
                    {bucket.status}
                  </span>
                </div>
                <p className="line-clamp-3 font-sans text-[14px] leading-[1.6] text-white/80">
                  {bucket.summary ?? (latest ? describeEvent(latest) : "Awaiting trace output.")}
                </p>
                {highlights.length ? (
                  <div className="space-y-1.5">
                    {highlights.map((highlight, index) => (
                      <p key={`${bucket.agentId}-${index}`} className="line-clamp-1 font-sans text-[12px] leading-[1.5] text-white/45">
                        {highlight}
                      </p>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
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
      ? "border-[#8b5862] bg-[#322229]"
      : "border-[#5f3941] bg-[#281c21] hover:bg-[#2d1f25]";
  }

  if (status === "running") {
    return isSelected
      ? "border-[#5a7f9f] bg-[#24313d]"
      : "border-[#36536c] bg-[#1d2630] hover:bg-[#212c37]";
  }

  return isSelected
    ? "border-white/20 bg-white/[0.06]"
    : "border-white/10 bg-[#171b21] hover:bg-white/[0.03]";
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buildAgentTraceBuckets, describeEvent, humanizeEventType } from "@/features/agent/lib/traces";
import type { AgentSSEEvent } from "@/features/agent/types";

type AgentTracePanelProps = {
  events: AgentSSEEvent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
};

export function AgentTracePanel({ events, selectedAgentId, onSelectAgent }: AgentTracePanelProps) {
  const buckets = buildAgentTraceBuckets(events);
  const activeBucket = buckets.find((bucket) => bucket.agentId === selectedAgentId) ?? buckets[0] ?? null;
  const activeEvents = activeBucket?.events.filter((event) => event.type !== "message.delta") ?? [];

  return (
    <Card size="sm" className="h-full min-h-0 bg-[#1b1f25]">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[1.4px]">Agent Trace</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 py-5">
        <div className="grid gap-3">
          {buckets.length ? (
            buckets.map((bucket) => (
              <button
                key={bucket.agentId}
                type="button"
                onClick={() => onSelectAgent(bucket.agentId)}
                className={cn(
                  "border px-4 py-4 text-left transition-colors",
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
                <p className="mt-3 line-clamp-3 font-sans text-[13px] leading-[1.6] text-white/75">
                  {bucket.summary ?? "No summary yet."}
                </p>
              </button>
            ))
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/25">No trace emitted yet</p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {activeBucket ? (
            <>
              <section className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Timeline</p>
                {activeEvents.length ? (
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
                  <p className="font-sans text-[14px] text-white/45">The selected agent has not emitted timeline events yet.</p>
                )}
              </section>

              <section className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">Sources</p>
                {activeBucket.citations.length ? (
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
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { AgentSSEEvent, Citation } from "@/features/agent/types";

type AgentTracePanelProps = {
  events: AgentSSEEvent[];
  citations: Citation[];
};

export function AgentTracePanel({ events, citations }: AgentTracePanelProps) {
  const recentEvents = events.slice(-20).reverse();

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Citations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {citations.length ? (
            citations.map((citation, index) => (
              <div key={`${citation.source}-${citation.label}-${index}`} className="space-y-2 border border-border px-3 py-3">
                <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                  <span>{citation.kind}</span>
                  <span>{citation.source}</span>
                </div>
                <p className="font-sans text-[14px] leading-[1.5] text-white/80">{citation.label}</p>
                {citation.excerpt ? <p className="font-sans text-[13px] leading-[1.5] text-white/50">{citation.excerpt}</p> : null}
              </div>
            ))
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">No citations yet</p>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Trace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentEvents.length ? (
            recentEvents.map((event) => (
              <div key={`${event.runId}-${event.sequence}`} className="space-y-2 border border-border px-3 py-3">
                <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                  <span>{String(event.sequence).padStart(2, "0")}</span>
                  <span>{event.type}</span>
                </div>
                <p className="font-sans text-[13px] leading-[1.5] text-white/70">{summarizeEvent(event)}</p>
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">{formatDate(event.timestamp)}</p>
              </div>
            ))
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">Trace will populate once AGOS starts emitting events</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function summarizeEvent(event: AgentSSEEvent) {
  const detail = event.data.detail;
  if (typeof detail === "string") return detail;

  const summary = event.data.summary;
  if (typeof summary === "string") return summary;

  const delta = event.data.delta;
  if (typeof delta === "string") return delta.trim() || "Token delta";

  const name = event.data.name;
  if (typeof name === "string") return name;

  const error = event.data.error;
  if (typeof error === "string") return error;

  return event.type;
}

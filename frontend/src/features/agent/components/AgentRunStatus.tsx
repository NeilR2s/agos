import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { AgentRun } from "@/features/agent/types";

type AgentRunStatusProps = {
  run: AgentRun | null;
  isStreaming: boolean;
  error: string | null;
  citationCount: number;
  selectedTicker?: string | null;
};

export function AgentRunStatus({ run, isStreaming, error, citationCount, selectedTicker }: AgentRunStatusProps) {
  const statusLabel = error ? "ERROR" : isStreaming ? "STREAMING" : run?.status?.toUpperCase() ?? "IDLE";

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Run Status</CardTitle>
        <CardDescription>Live execution state for the active copilot run.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="flex items-center justify-between gap-3 border border-border px-3 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Status</span>
          <Badge variant="outline" className="border-border text-white/70">
            {statusLabel}
          </Badge>
        </div>
        <Metric label="Ticker" value={selectedTicker ?? run?.selectedTicker ?? "---"} />
        <Metric label="Model" value={run?.model ?? (isStreaming ? "pending" : "---")} />
        <Metric label="Latency" value={run?.latencyMs ? `${formatNumber(run.latencyMs, "en-PH", 0)} ms` : "---"} />
        <Metric label="TTFT" value={run?.ttftMs ? `${formatNumber(run.ttftMs, "en-PH", 0)} ms` : "---"} />
        <Metric label="Citations" value={String(citationCount)} />
        {error ? <p className="border border-white/10 px-3 py-3 font-sans text-[14px] leading-[1.5] text-[#a67b7b]">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 border border-border px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">{label}</p>
      <p className="font-mono text-[12px] uppercase tracking-[1.2px] text-white/80">{value}</p>
    </div>
  );
}

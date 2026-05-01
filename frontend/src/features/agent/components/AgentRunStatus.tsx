import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDurationMs, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/features/agent/types";

type AgentRunStatusProps = {
  run: AgentRun | null;
  isStreaming: boolean;
  error: string | null;
  citationCount: number;
  selectedTicker?: string | null;
  agentCount: number;
};

export function AgentRunStatus({ run, isStreaming, error, citationCount, selectedTicker, agentCount }: AgentRunStatusProps) {
  const statusLabel = error ? "ERROR" : isStreaming ? "STREAMING" : run?.status?.toUpperCase() ?? "IDLE";
  const config = run?.config ?? {};
  const modelLabel = typeof config.modelLabel === "string" ? config.modelLabel : run?.model ?? "---";
  const thinkingLevel = typeof config.thinkingLevel === "string" ? config.thinkingLevel : "---";

  return (
    <Card size="sm" className="bg-card">
      <CardHeader className="border-b border-border">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[1.4px]">Run Status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 py-5 sm:grid-cols-2 xl:grid-cols-1">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-4 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Status</span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.4px]",
              error
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : isStreaming
                  ? "border-chart-3/50 bg-chart-3/10 text-chart-3"
                  : "border-border bg-secondary/40 text-muted-foreground"
            )}
          >
            {statusLabel}
          </span>
        </div>
        <Metric label="Ticker" value={selectedTicker ?? run?.selectedTicker ?? "---"} />
        <Metric label="Model" value={modelLabel} />
        <Metric label="Workers" value={String(agentCount)} />
        <Metric label="Thinking" value={thinkingLevel} />
        <Metric label="Latency" value={formatDurationMs(run?.latencyMs)} />
        <Metric label="TTFT" value={run?.ttftMs ? `${formatNumber(run.ttftMs, "en-PH", 0)} ms` : "---"} />
        <Metric label="Sources" value={String(citationCount)} />
        {error ? <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 font-sans text-[14px] leading-[1.6] text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 rounded-2xl border border-border px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">{label}</p>
      <p className="font-mono text-[12px] uppercase tracking-[1.2px] text-foreground/85">{value}</p>
    </div>
  );
}

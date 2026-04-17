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
    <Card size="sm" className="bg-[#1b1f25]">
      <CardHeader className="border-b border-white/10">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[1.4px]">Run Status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 py-5 sm:grid-cols-2 xl:grid-cols-1">
        <div className="flex items-center justify-between gap-3 border border-white/10 px-4 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">Status</span>
          <span
            className={cn(
              "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.4px]",
              error
                ? "border-[#6b3a41] bg-[#2b1d22] text-[#d7a5ad]"
                : isStreaming
                  ? "border-[#36536c] bg-[#1e2933] text-[#a9c4df]"
                  : "border-white/15 bg-white/[0.03] text-white/70"
            )}
          >
            {statusLabel}
          </span>
        </div>
        <Metric label="Ticker" value={selectedTicker ?? run?.selectedTicker ?? "---"} />
        <Metric label="Model" value={modelLabel} />
        <Metric label="Agents" value={String(agentCount)} />
        <Metric label="Thinking" value={thinkingLevel} />
        <Metric label="Latency" value={formatDurationMs(run?.latencyMs)} />
        <Metric label="TTFT" value={run?.ttftMs ? `${formatNumber(run.ttftMs, "en-PH", 0)} ms` : "---"} />
        <Metric label="Sources" value={String(citationCount)} />
        {error ? <p className="border border-[#6b3a41] bg-[#2b1d22] px-4 py-4 font-sans text-[14px] leading-[1.6] text-[#d7a5ad]">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 border border-white/10 px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">{label}</p>
      <p className="font-mono text-[12px] uppercase tracking-[1.2px] text-white/85">{value}</p>
    </div>
  );
}

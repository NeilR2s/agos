import { Button } from "@/components/ui/button";
import type { AgentMode } from "@/features/agent/types";

type AgentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  selectedTicker?: string | null;
  mode: AgentMode;
};

export function AgentComposer({ value, onChange, onSubmit, isStreaming, selectedTicker, mode }: AgentComposerProps) {
  return (
    <div className="space-y-4 border-t border-border px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
        <span>Mode {mode}</span>
        <span>/</span>
        <span>Ticker {selectedTicker ?? "none"}</span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Ask AGOS for portfolio-aware research, market context, or a guarded trade read."
        className="min-h-[120px] w-full resize-none border border-border bg-transparent px-4 py-3 font-sans text-[15px] leading-[1.6] text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-ring"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Ctrl + Enter to send</p>
        <Button onClick={onSubmit} disabled={isStreaming || !value.trim()} className="w-full sm:w-auto">
          {isStreaming ? "Running..." : "Send to AGOS"}
        </Button>
      </div>
    </div>
  );
}

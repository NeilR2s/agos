import { useEffect, useRef } from "react";
import { AdjustmentsHorizontalIcon, Bars3BottomLeftIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { AGOS_MODEL_PRESETS } from "@/features/agent/config";
import type { AgentMode, AgentRunConfig } from "@/features/agent/types";

type AgentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onToggleRunPanel: () => void;
  onToggleControlsPanel: () => void;
  activePanel: "run" | "controls" | null;
  isBusy: boolean;
  isStreaming: boolean;
  streamStatus: "idle" | "running" | "completed" | "error" | "cancelled";
  selectedTicker?: string | null;
  mode: AgentMode;
  config: AgentRunConfig;
};

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  onToggleRunPanel,
  onToggleControlsPanel,
  activePanel,
  isBusy,
  isStreaming,
  streamStatus,
  selectedTicker,
  mode,
  config,
}: AgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedModel = AGOS_MODEL_PRESETS.find((preset) => preset.id === config.modelPreset);
  const actionLabel = isStreaming ? "Running..." : isBusy && streamStatus === "cancelled" ? "Cancelling..." : isBusy ? "Starting..." : "Run Agent";

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <div className="border-t border-white/10 bg-[#1b1f25] px-4 py-3 backdrop-blur-sm md:px-5">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
          <span>{selectedModel?.label ?? "AGOS"}</span>
          <span>/</span>
          <span>{config.maxAgents} concurrent workers</span>
          <span>/</span>
          <span>{mode}</span>
          <span>/</span>
          <span>{selectedTicker ?? "no ticker"}</span>
          <span>/</span>
          <span>{config.thinkingLevel} thinking</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleRunPanel}
            aria-expanded={activePanel === "run"}
            className="border-white/15 text-white/75 hover:bg-white/[0.05]"
          >
            <Bars3BottomLeftIcon className="size-4" /> Trace Details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleControlsPanel}
            aria-expanded={activePanel === "controls"}
            className="border-white/15 text-white/75 hover:bg-white/[0.05]"
          >
            <AdjustmentsHorizontalIcon className="size-4" /> Controls
          </Button>
        </div>
      </div>

      <div className="border border-white/10 bg-[#20242b]">
        <textarea
          ref={textareaRef}
          id="agent-composer"
          name="agent-composer"
          aria-label="Message AGOS"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Direct AGOS across research, portfolio context, execution risk, and grounded web retrieval."
          className="max-h-[180px] min-h-[72px] w-full resize-none border-0 bg-transparent px-4 py-4 font-sans text-[15px] leading-[1.6] text-white outline-none placeholder:text-white/40 md:px-5"
        />
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Ctrl + Enter to send</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isStreaming ? (
              <Button type="button" variant="outline" size="sm" onClick={onCancel} className="border-white/20 bg-transparent hover:bg-white/[0.06]">
                Cancel Run
              </Button>
            ) : null}
            <Button
              onClick={onSubmit}
              disabled={isBusy || !value.trim()}
              className="min-w-[176px] border border-white bg-white text-[#1f2228] hover:bg-white/90 disabled:border-white/10 disabled:bg-white/[0.14] disabled:text-white/35"
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

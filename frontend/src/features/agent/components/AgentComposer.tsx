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
  isStreaming: boolean;
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
  isStreaming,
  selectedTicker,
  mode,
  config,
}: AgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedModel = AGOS_MODEL_PRESETS.find((preset) => preset.id === config.modelPreset);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 240)}px`;
  }, [value]);

  return (
    <div className="border-t border-white/10 bg-[#1b1f25] px-5 py-5 backdrop-blur-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
          <span>{selectedModel?.label ?? "AGOS"}</span>
          <span>/</span>
          <span>{config.maxAgents} agents</span>
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
            <Bars3BottomLeftIcon className="size-4" /> Run
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
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Direct AGOS across research, portfolio context, execution risk, and grounded web retrieval."
          className="max-h-[240px] min-h-[104px] w-full resize-none border-0 bg-transparent px-5 py-5 font-sans text-[15px] leading-[1.7] text-white outline-none placeholder:text-white/25"
        />
        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
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
              disabled={isStreaming || !value.trim()}
              className="min-w-[176px] border border-white bg-white text-[#1f2228] hover:bg-white/90 disabled:border-white/10 disabled:bg-white/[0.14] disabled:text-white/35"
            >
              {isStreaming ? "Agents Running" : "Send to AGOS"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

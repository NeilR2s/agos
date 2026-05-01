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
    <div className="mx-auto w-full max-w-[900px] rounded-[28px] border border-input bg-secondary/70 p-3 shadow-none backdrop-blur-xl">
      <div className="mb-2 flex flex-col gap-2 px-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
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
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <Bars3BottomLeftIcon className="size-4" /> Trace Details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleControlsPanel}
            aria-expanded={activePanel === "controls"}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <AdjustmentsHorizontalIcon className="size-4" /> Controls
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-border/70 bg-background/45">
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
          className="max-h-[180px] min-h-[72px] w-full resize-none border-0 bg-transparent px-4 py-4 font-sans text-[15px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground md:px-5"
        />
        <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">Ctrl + Enter to send</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isStreaming ? (
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Cancel Run
              </Button>
            ) : null}
            <Button
              onClick={onSubmit}
              disabled={isBusy || !value.trim()}
              className="min-w-[176px]"
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const actionLabel = isStreaming ? "Executing..." : isBusy && streamStatus === "cancelled" ? "Terminating..." : isBusy ? "Initializing..." : "Execute";

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <div className="mx-auto w-full max-w-[900px] shrink-0 rounded-[26px] border border-input bg-secondary/75 p-2 shadow-none backdrop-blur-xl md:rounded-[30px]">
      <div className="mb-1.5 flex flex-col gap-2 px-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
          <span>{selectedModel?.label ?? "AGOS"}</span>
          <span>/</span>
          <span className="hidden sm:inline">{config.maxAgents} concurrent workers</span>
          <span className="hidden sm:inline">/</span>
          <span>{mode}</span>
          <span>/</span>
          <span>{selectedTicker ?? "no ticker"}</span>
          <span className="hidden sm:inline">/</span>
          <span className="hidden sm:inline">{config.thinkingLevel} thinking</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleRunPanel}
            aria-expanded={activePanel === "run"}
            className="h-7 border-border px-2.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Bars3BottomLeftIcon className="size-4" /> Trace
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleControlsPanel}
            aria-expanded={activePanel === "controls"}
            className="h-7 border-border px-2.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <AdjustmentsHorizontalIcon className="size-4" /> Parameters
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-border/70 bg-background/70">
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
          placeholder="Command Agos: Research floor, portfolio memory, and signal traces."
          className="max-h-[150px] min-h-[52px] w-full resize-none border-0 bg-transparent px-4 py-3.5 font-sans text-[15px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground md:min-h-[56px] md:px-5"
        />
        <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-2.5 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">Ctrl + Enter to Execute</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isStreaming ? (
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Terminate Run
              </Button>
            ) : null}
            <Button
              onClick={onSubmit}
              disabled={isBusy || !value.trim()}
              className="h-9 w-full min-w-[160px] rounded-full md:w-auto"
            >
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

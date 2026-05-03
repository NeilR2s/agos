import { useEffect, useRef } from "react";
import { AdjustmentsHorizontalIcon, Bars3BottomLeftIcon, PaperAirplaneIcon, PlusIcon, StopCircleIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { AGOS_MODEL_PRESETS } from "@/features/agent/config";
import type { AgentMode, AgentRunConfig } from "@/features/agent/types";
import { cn } from "@/lib/utils";

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
  isLanding?: boolean;
};

const landingPrompts = [
  "Audit portfolio allocation",
  "Compare holdings",
  "Create deployment plan",
  "Assess ticker risk",
];

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
  isLanding = false,
}: AgentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedModel = AGOS_MODEL_PRESETS.find((preset) => preset.id === config.modelPreset);
  const actionLabel = isStreaming ? "Stop run" : isBusy && streamStatus === "cancelled" ? "Terminating" : isBusy ? "Initializing" : "Send message";

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <div className={cn("mx-auto w-full shrink-0", isLanding ? "max-w-[780px]" : "max-w-[900px]")}>
      <div className={cn(
        "rounded-[24px] border border-input bg-card/85 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_6%,transparent)] backdrop-blur-xl transition-colors focus-within:border-ring/70",
        isLanding ? "p-4" : "p-3",
        isStreaming && "py-2"
      )}>
        {!isStreaming && (
          <textarea
            ref={textareaRef}
            id="agent-composer"
            name="agent-composer"
            aria-label="Message AGOS"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask AGOS anything"
            className={cn(
              "max-h-[170px] w-full resize-none border-0 bg-transparent font-sans text-[15px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground/60 md:text-[16px]",
              isLanding ? "min-h-[76px] px-1 pb-4 pt-1" : "min-h-[64px] px-1 pb-3 pt-1"
            )}
          />
        )}

        <div className={cn(
          "flex flex-col md:flex-row md:items-center md:justify-between",
          isStreaming ? "gap-2" : "border-t border-border/55 gap-3 pt-3"
        )}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {isStreaming ? (
              <span className="font-sans text-[14px] text-muted-foreground/80">Agents are working…</span>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggleControlsPanel}
                  aria-label="Open tools and parameters"
                  aria-expanded={activePanel === "controls"}
                  className={cn(
                    "size-8 rounded-full border border-transparent bg-transparent text-muted-foreground/70 hover:bg-secondary/40 hover:text-foreground",
                    activePanel === "controls" && "border-ring/60 bg-accent text-foreground"
                  )}
                >
                  {isLanding ? <PlusIcon className="size-4" /> : <AdjustmentsHorizontalIcon className="size-4" />}
                </Button>
                <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/65">{isLanding ? "Tools" : selectedModel?.label ?? "AGOS"}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
              {!isStreaming && (
                <>
                  <span className="px-1.5 text-muted-foreground/50">{mode}</span>
                  <span className="hidden px-1.5 text-muted-foreground/50 sm:inline-flex">{selectedTicker ?? "no ticker"}</span>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onToggleRunPanel}
                aria-expanded={activePanel === "run"}
                className={cn(
                  "h-8 rounded-full border-border/60 bg-secondary/15 px-2.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground",
                  activePanel === "run" && "border-ring/60 bg-accent text-foreground"
                )}
              >
                <Bars3BottomLeftIcon className="size-4" /> Trace
              </Button>
              {!isLanding && !isStreaming ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onToggleControlsPanel}
                  aria-expanded={activePanel === "controls"}
                  className={cn(
                    "h-8 rounded-full border-border/60 bg-secondary/15 px-2.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground",
                    activePanel === "controls" && "border-ring/60 bg-accent text-foreground"
                  )}
                >
                  Params
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={isStreaming ? onCancel : onSubmit}
              disabled={!isStreaming && (isBusy || !value.trim())}
              aria-label={actionLabel}
              title={actionLabel}
              className={cn(
                "h-10 shrink-0 rounded-full shadow-none",
                isStreaming ? "border-destructive/60 bg-destructive/15 text-destructive hover:border-destructive hover:bg-destructive/25 hover:text-destructive px-4" : "size-10 p-0"
              )}
              variant={isStreaming ? "outline" : "default"}
            >
              {isStreaming ? (
                <div className="flex items-center gap-2">
                  <StopCircleIcon className="size-5" />
                  <span className="font-mono text-[10px] uppercase tracking-[1.2px]">Stop</span>
                </div>
              ) : <PaperAirplaneIcon className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {isLanding ? (
        <div className="mx-auto mt-5 flex max-w-[720px] flex-wrap justify-center gap-2">
          {landingPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onChange(prompt)}
              className="rounded-full border border-border/55 bg-secondary/30 px-4 py-2 font-sans text-[13px] leading-none text-foreground/75 transition-colors hover:border-ring/50 hover:bg-accent/55 hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

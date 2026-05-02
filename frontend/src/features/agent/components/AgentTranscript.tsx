import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { AgentWorkingTrace } from "@/features/agent/components/AgentWorkingTrace";
import type { AgentMessage, AgentSSEEvent, Citation } from "@/features/agent/types";
import { cn } from "@/lib/utils";

type AgentTranscriptProps = {
  messages: AgentMessage[];
  events?: AgentSSEEvent[];
  citations?: Citation[];
  isStreaming: boolean;
  activeRunId?: string | null;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSelectRun: (runId: string) => void;
  isLanding?: boolean;
};

const markdownComponents: Components = {
  table({ children }) {
    return (
      <div className="agent-markdown-table-wrap">
        <table className="agent-markdown-table">{children}</table>
      </div>
    );
  },
  a({ children, href }) {
    return (
      <a href={href} target={href ? "_blank" : undefined} rel={href ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  },
};

export function AgentTranscript({
  messages,
  events = [],
  citations = [],
  isStreaming,
  activeRunId,
  selectedAgentId,
  onSelectAgent,
  onSelectRun,
  isLanding = false,
}: AgentTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (!stickToBottom) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, events, stickToBottom]);

  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setStickToBottom(distanceFromBottom < 96);
  };

  return (
    <div className={cn("relative flex min-h-0 flex-col", isLanding ? "flex-none overflow-visible" : "flex-1 overflow-hidden")}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "scrollbar-hidden min-h-0",
          isLanding ? "overflow-visible px-2 pb-0 pt-0" : "flex-1 overflow-y-auto px-2 pb-6 pt-5 md:px-5 md:pb-8 md:pt-8"
        )}
      >
        {messages.length ? (
          <div className="mx-auto w-full max-w-[920px] space-y-10 pb-8">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const isLiveRunMessage = Boolean(isAssistant && isStreaming && message.id.startsWith("live-") && message.runId === activeRunId);
              const showRunDetailsCard = Boolean(isAssistant && message.runId && !isLiveRunMessage);
              const showTrace = Boolean(isAssistant && !showRunDetailsCard && message.runId && activeRunId && message.runId === activeRunId && events.length);
              const msgCitations = showTrace ? citations : message.citations;

              const traceNode = showTrace ? (
                <AgentWorkingTrace
                  events={events}
                  isStreaming={isStreaming}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                />
              ) : null;

              return (
                <article key={message.id} className={isAssistant ? "space-y-4" : "flex justify-end"}>
                  {isAssistant ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/75">
                        <span className="size-1.5 rounded-full bg-chart-2" />
                        <span>AGOS</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(message.content);
                        }}
                        aria-label="Copy message"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ClipboardDocumentIcon className="size-4" />
                      </Button>
                    </div>
                  ) : null}

                  {showRunDetailsCard && message.runId ? (
                    <RunSummaryCard message={message} isActive={message.runId === activeRunId} onSelectRun={onSelectRun} />
                  ) : null}

                  {traceNode}

                  {isAssistant && (message.content || !showTrace) ? (
                    <div className="max-w-[820px]">
                      <div className="agent-markdown agent-markdown-chat">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : !isAssistant ? (
                    <div className="ml-auto max-w-[680px] rounded-[22px] border border-border/80 bg-secondary/80 px-5 py-3.5 font-sans text-[15px] leading-[1.6] text-foreground shadow-none backdrop-blur-xl">
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  ) : null}

                  {isAssistant && !message.structuredOutput && msgCitations.length > 0 ? (
                    <div className="flex max-w-[820px] flex-wrap gap-2">
                      {msgCitations.map((citation, index) => (
                        <a
                          key={`${message.id}-${citation.source}-${index}`}
                          href={citation.href ?? undefined}
                          target={citation.href ? "_blank" : undefined}
                          rel={citation.href ? "noreferrer" : undefined}
                          className="rounded-full border border-border bg-secondary/45 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground transition-colors hover:border-ring/60 hover:bg-accent hover:text-foreground"
                        >
                          {citation.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={cn("relative flex items-center overflow-visible", isLanding ? "min-h-0" : "h-full min-h-[360px] md:min-h-[460px]")}>
            {!isLanding ? (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--foreground)_6%,transparent),transparent_64%)]" aria-hidden="true" />
            ) : null}

            <div className={cn("relative z-10 mx-auto flex w-full flex-col justify-center", isLanding ? "max-w-[820px] gap-3 px-1 py-0 text-center" : "max-w-[880px] gap-6 px-1 py-8 md:px-6 md:py-10")}>
              <div className="text-center">
                <p className="font-mono text-[11px] uppercase tracking-[1.7px] text-muted-foreground/80">AGOS</p>
                <h2 className={cn("mt-3 font-sans font-light tracking-[-0.055em] text-foreground", isLanding ? "text-[40px] leading-[1.02] md:text-[56px]" : "text-[42px] leading-[0.95] md:text-[64px]")}>Where should we start?</h2>
                <p className="mx-auto mt-4 max-w-[560px] font-sans text-[14px] leading-[1.65] text-muted-foreground md:text-[15px]">
                  Ask for a portfolio memo, source-backed research, or a multi-agent trading review.
                </p>
              </div>

              {!isLanding ? <ReadinessStrip /> : null}
            </div>
          </div>
        )}
      </div>

      {!stickToBottom ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const node = scrollRef.current;
              if (!node) return;
              node.scrollTop = node.scrollHeight;
              setStickToBottom(true);
            }}
            className="pointer-events-auto bg-popover/95 backdrop-blur-xl"
          >
            <ArrowDownIcon className="size-4" /> Jump to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ReadinessStrip() {
  return (
    <div className="mx-auto max-w-full overflow-x-auto rounded-full border border-border/70 bg-background/55 px-4 py-3 backdrop-blur-xl md:overflow-visible">
      <div className="flex min-w-max gap-4 md:grid md:min-w-0 md:grid-cols-5 md:gap-2">
        {[
          ["OK", "Portfolio state"],
          ["OK", "Thread history"],
          ["OK", "Market tools"],
          ["OK", "Citations"],
          ["OFF", "Execution gate"],
        ].map(([state, label]) => (
          <div key={label} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
            <span className={state === "OK" ? "text-chart-2" : "text-muted-foreground/55"}>{state}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunSummaryCard({ message, isActive, onSelectRun }: { message: AgentMessage; isActive: boolean; onSelectRun: (runId: string) => void }) {
  const output = message.structuredOutput;
  const sourceCount = output?.sources.length ?? message.citations.length;
  const actionCount = output?.recommendations.length ?? 0;
  const warningCount = output?.reliabilityWarnings?.length ?? 0;
  const riskCount = output?.risks.length ?? 0;
  const runId = message.runId;

  if (!runId) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => onSelectRun(runId)}
      className={cn(
        "group relative max-w-[820px] overflow-hidden rounded-[24px] border px-4 py-3 text-left shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_5%,transparent)] backdrop-blur-xl transition-colors",
        isActive
          ? "border-border/80 bg-card/45"
          : "border-border/70 bg-card/35 hover:border-ring/45 hover:bg-accent/20"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-foreground/[0.025] to-transparent" aria-hidden="true" />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.25px] text-muted-foreground/75">
            <span className="rounded-full border border-border/55 bg-secondary/20 px-2 py-0.5">
              {output?.executionReady ? "execution ready" : "advisory only"}
            </span>
            <span className="hidden text-muted-foreground/45 sm:inline">/</span>
            <span className="text-muted-foreground/70">Run audit available</span>
          </div>
          <p className="font-sans text-[13px] leading-[1.55] text-muted-foreground">Open synthesis, evidence, actions, citations, and worker timeline.</p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-secondary/20 px-2.5 py-1">{sourceCount} citations</span>
          <span className="rounded-full border border-border/60 bg-secondary/20 px-2.5 py-1">{actionCount} actions</span>
          <span className="rounded-full border border-border/60 bg-secondary/20 px-2.5 py-1">{riskCount} risks</span>
          {warningCount ? <span className="rounded-full border border-chart-1/35 bg-chart-1/[0.06] px-2.5 py-1 text-chart-1/90">{warningCount} warnings</span> : null}
          <span className="rounded-full border border-ring/35 bg-secondary/25 px-2.5 py-1 text-foreground/75 transition-colors group-hover:border-chart-1/45 group-hover:text-foreground">View Details</span>
        </div>
      </div>
    </button>
  );
}

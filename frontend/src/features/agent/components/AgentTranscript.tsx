import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { AgentOutputTabs } from "@/features/agent/components/AgentOutputTabs";
import { AgentWorkingTrace } from "@/features/agent/components/AgentWorkingTrace";
import type { AgentMessage, AgentSSEEvent, Citation } from "@/features/agent/types";

type AgentTranscriptProps = {
  messages: AgentMessage[];
  events?: AgentSSEEvent[];
  citations?: Citation[];
  isStreaming: boolean;
  activeRunId?: string | null;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
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
    <div className="grok-starfield relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-border/60 bg-background/40">
      <div ref={scrollRef} onScroll={handleScroll} className="agent-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        {messages.length ? (
          <div className="mx-auto w-full max-w-[860px] space-y-8 pb-6">
            {messages.map((message) => {
              const isAssistant = message.role === "assistant";
              const showTrace = Boolean(isAssistant && message.runId && activeRunId && message.runId === activeRunId && events.length);
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
                <article key={message.id} className={isAssistant ? "space-y-4" : "flex flex-col items-end gap-3"}>
                  <div className={isAssistant ? "flex items-center justify-between gap-3" : "flex w-full max-w-[760px] items-center justify-end gap-3"}>
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary/50 font-mono text-[10px] uppercase tracking-[1.4px] text-foreground">
                        {isAssistant ? "A" : "U"}
                      </div>
                      <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-muted-foreground">
                        {isAssistant ? "AGOS" : "Operator"}
                      </span>
                    </div>
                    {isAssistant ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(message.content);
                        }}
                        aria-label="Copy message"
                      >
                        <ClipboardDocumentIcon className="size-4" />
                      </Button>
                    ) : null}
                  </div>

                  {isAssistant && message.structuredOutput ? (
                    <AgentOutputTabs output={message.structuredOutput} markdown={message.content} traceNode={traceNode} />
                  ) : traceNode}

                  {isAssistant && !message.structuredOutput && (message.content || !showTrace) ? (
                    <div className="max-w-[1040px]">
                      <div className="agent-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : !isAssistant ? (
                    <div className="ml-auto max-w-[760px] rounded-2xl border border-border bg-secondary/70 px-5 py-4 font-sans text-[15px] leading-[1.65] text-foreground">
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  ) : null}

                  {isAssistant && !message.structuredOutput && msgCitations.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {msgCitations.map((citation, index) => (
                        <a
                          key={`${message.id}-${citation.source}-${index}`}
                          href={citation.href ?? undefined}
                          target={citation.href ? "_blank" : undefined}
                          rel={citation.href ? "noreferrer" : undefined}
                          className="rounded-full border border-border bg-secondary/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
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
          <div className="relative flex h-full min-h-[420px] items-center overflow-hidden">
            <div className="pointer-events-none absolute inset-x-[-10%] top-[-35%] h-[420px] rounded-full bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--foreground)_18%,transparent)_0%,color-mix(in_oklch,var(--chart-3)_18%,transparent)_28%,transparent_68%)] blur-3xl" aria-hidden="true" />

            <div className="relative z-10 mx-auto flex w-full max-w-[920px] flex-col justify-center gap-7 px-2 py-10 md:px-6">
              <div className="text-center">
                <p className="font-mono text-[12px] uppercase tracking-[1.4px] text-muted-foreground">AGOS chat shell</p>
                <h2 className="mt-3 font-sans text-[42px] font-light leading-[1] tracking-[-0.04em] text-foreground md:text-[56px]">What should AGOS do?</h2>
              </div>

              <div className="mt-2 grid gap-3 md:grid-cols-4">
                {[
                  "Review my portfolio allocation",
                  "Compare holdings against market conditions",
                  "Create a 30-day deployment plan",
                  "Research ticker-specific downside risks",
                ].map((task) => (
                  <div key={task} className="rounded-2xl border border-border bg-card/60 px-4 py-4 backdrop-blur-md">
                    <p className="font-sans text-[13px] leading-[1.45] text-foreground/80">{task}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-md md:grid-cols-5">
                {[
                  ["OK", "Portfolio snapshot"],
                  ["OK", "Prior threads"],
                  ["OK", "Market tools"],
                  ["OK", "Web search"],
                  ["OFF", "Trading execution"],
                ].map(([state, label]) => (
                  <div key={label} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
                    <span className={state === "OK" ? "text-chart-2" : "text-muted-foreground/55"}>{state}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
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

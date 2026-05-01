import { useEffect, useRef, useState } from "react";
import { ArrowDownIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import landingHero from "@/assets/landing_hero.jpeg";
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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-white/10 bg-[#171a20]">
      <div ref={scrollRef} onScroll={handleScroll} className="agent-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {messages.length ? (
          <div className="mx-auto w-full max-w-[1180px] space-y-8 pb-6">
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
                <article key={message.id} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center border border-white/20 bg-white/[0.03] font-mono text-[10px] uppercase tracking-[1.4px] text-white">
                        {isAssistant ? "A" : "U"}
                      </div>
                      <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-white/45">
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
                    <div className="ml-auto max-w-[760px] border border-white/10 bg-white/[0.05] px-5 py-4 font-sans text-[15px] leading-[1.65] text-white">
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
                          className="border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/60 transition-colors hover:border-white/20 hover:text-white"
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
          <div className="relative flex h-full min-h-[360px] overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-35"
              style={{ backgroundImage: `url(${landingHero})` }}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, #171a20 0%, rgba(23,26,32,0.88) 38%, rgba(23,26,32,0.58) 68%, #171a20 100%), linear-gradient(0deg, #171a20 0%, rgba(23,26,32,0.2) 46%, #171a20 100%)",
              }}
              aria-hidden="true"
            />

            <div className="relative z-10 flex w-full flex-col justify-center gap-5 px-2 py-8 md:px-6">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[1.4px] text-white/35">AGOS chat shell</p>
                <h2 className="mt-3 max-w-[760px] font-sans text-[32px] leading-[1.1] text-white md:text-[42px]">What should AGOS do?</h2>
              </div>

              <div className="mt-2 grid max-w-[980px] gap-3 md:grid-cols-4">
                {[
                  "Review my portfolio allocation",
                  "Compare holdings against market conditions",
                  "Create a 30-day deployment plan",
                  "Research ticker-specific downside risks",
                ].map((task) => (
                  <div key={task} className="border border-white/10 bg-[#171a20]/70 px-4 py-4 backdrop-blur-[1px]">
                    <p className="font-sans text-[13px] leading-[1.45] text-white/78">{task}</p>
                  </div>
                ))}
              </div>

              <div className="grid max-w-[980px] gap-2 border border-white/10 bg-[#171a20]/70 p-4 backdrop-blur-[1px] md:grid-cols-5">
                {[
                  ["OK", "Portfolio snapshot"],
                  ["OK", "Prior threads"],
                  ["OK", "Market tools"],
                  ["OK", "Web search"],
                  ["OFF", "Trading execution"],
                ].map(([state, label]) => (
                  <div key={label} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.2px] text-white/45">
                    <span className={state === "OK" ? "text-[#8fb394]" : "text-white/25"}>{state}</span>
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
            className="pointer-events-auto bg-[#1b1f25]"
          >
            <ArrowDownIcon className="size-4" /> Jump to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
}

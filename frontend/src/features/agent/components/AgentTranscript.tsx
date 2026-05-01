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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-white/10 bg-[#171a20]">
      <div ref={scrollRef} onScroll={handleScroll} className="agent-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
        {messages.length ? (
          <div className="space-y-9 pb-8">
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
                    <div className="max-w-[980px]">
                      <div className="agent-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : !isAssistant ? (
                    <div className="ml-auto max-w-[860px] border border-white/10 bg-white/[0.05] px-5 py-4 font-sans text-[15px] leading-[1.65] text-white">
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
          <div className="flex h-full min-h-[420px] flex-col justify-center gap-5 px-2">
            <div>
              <p className="font-mono text-[12px] uppercase tracking-[1.4px] text-white/35">AGOS chat shell</p>
              <h2 className="mt-3 max-w-[780px] font-sans text-[32px] leading-[1.1] text-white md:text-[40px]">What should AGOS do?</h2>
            </div>

            <div className="mt-4 grid max-w-[900px] gap-6 md:grid-cols-2">
              <div className="space-y-3 border border-white/10 bg-white/[0.02] p-5">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">Suggested Tasks</p>
                <ul className="ml-2 list-disc space-y-2 pl-4 font-sans text-[14px] leading-[1.5] text-white/80">
                  <li>Review my current portfolio allocation</li>
                  <li>Compare my holdings against market conditions</li>
                  <li>Create a 30-day capital deployment plan</li>
                  <li>Research ticker-specific downside risks</li>
                </ul>
              </div>
              <div className="space-y-3 border border-white/10 bg-white/[0.02] p-5">
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/50">Available Context</p>
                <ul className="space-y-2 font-sans text-[14px] leading-[1.5] text-white/80">
                  <li className="flex items-center gap-3">
                    <span className="font-mono text-[#6e9973]">OK</span> Portfolio snapshot
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="font-mono text-[#6e9973]">OK</span> Prior agent threads
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="font-mono text-[#6e9973]">OK</span> Market tools
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="font-mono text-[#6e9973]">OK</span> Web search
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="font-mono text-white/30">OFF</span> Trading execution disabled
                  </li>
                </ul>
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

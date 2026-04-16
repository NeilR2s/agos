import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentWorkingTrace } from "./AgentWorkingTrace";
import type { AgentMessage, AgentSSEEvent, Citation } from "@/features/agent/types";

type AgentTranscriptProps = {
  messages: AgentMessage[];
  events?: AgentSSEEvent[];
  citations?: Citation[];
  isStreaming: boolean;
};

export function AgentTranscript({ messages, events = [], citations = [], isStreaming }: AgentTranscriptProps) {
  return (
    <Card className="min-h-[420px] xl:h-[calc(100dvh-180px)] border-0 bg-transparent shadow-none">
      <CardContent className="space-y-8 overflow-y-auto px-4 py-4 xl:h-full pb-32">
        {messages.length ? (
          messages.map((message) => {
            const isAssistant = message.role === "assistant";
            
            // Only show trace under the CURRENT streaming assistant message, 
            // or if it's the last assistant message and we are streaming.
            const showTrace = isStreaming && isAssistant && message.id.startsWith("live-");
            
            // Collect citations specifically for this message (or live stream)
            const msgCitations = isAssistant && message.id.startsWith("live-") 
              ? citations 
              : message.citations;

            return (
              <article key={message.id} className="space-y-3 px-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-mono text-[10px] text-white">
                    {isAssistant ? "A" : "U"}
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-white/50">
                    {isAssistant ? "AGOS Copilot" : "Operator"}
                  </span>
                </div>
                
                {showTrace && <AgentWorkingTrace events={events} isStreaming={isStreaming} />}
                
                <div className="pl-11 pr-4 font-sans text-[15px] leading-[1.7] text-white/90 prose prose-invert max-w-none">
                  {isAssistant ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <div className="whitespace-pre-wrap px-4 py-3 bg-white/5 rounded-2xl inline-block max-w-[85%]">
                      {message.content}
                    </div>
                  )}
                </div>

                {msgCitations && msgCitations.length > 0 && isAssistant ? (
                  <div className="pl-11 pt-4 flex flex-wrap gap-2">
                    {msgCitations.map((citation, index) => (
                      <a
                        key={`${message.id}-${citation.source}-${index}`}
                        href={citation.href ?? undefined}
                        target={citation.href ? "_blank" : undefined}
                        rel={citation.href ? "noreferrer" : undefined}
                        className="border border-white/10 bg-white/5 rounded-full px-3 py-1 font-sans text-[12px] text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        {citation.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center space-y-4 opacity-40">
             <div className="text-[64px] font-mono tracking-tighter">AGOS</div>
             <p className="font-mono text-[12px] uppercase tracking-[2px]">Awaiting Instructions</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

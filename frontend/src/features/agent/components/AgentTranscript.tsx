import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { AgentMessage } from "@/features/agent/types";

type AgentTranscriptProps = {
  messages: AgentMessage[];
  isStreaming: boolean;
};

export function AgentTranscript({ messages, isStreaming }: AgentTranscriptProps) {
  return (
    <Card className="min-h-[420px] xl:h-[calc(100dvh-220px)]">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle>Transcript</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 overflow-y-auto px-4 py-4 xl:h-full">
        {messages.length ? (
          messages.map((message) => {
            const isAssistant = message.role === "assistant";
            return (
              <article key={message.id} className="space-y-3 border border-border px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                    <span>{isAssistant ? "AGOS" : "Operator"}</span>
                    <span>/</span>
                    <span>{message.role}</span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">{formatDate(message.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap font-sans text-[15px] leading-[1.7] text-white/80">{message.content}</div>
                {message.citations.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {message.citations.map((citation, index) => (
                      <a
                        key={`${message.id}-${citation.source}-${index}`}
                        href={citation.href ?? undefined}
                        target={citation.href ? "_blank" : undefined}
                        rel={citation.href ? "noreferrer" : undefined}
                        className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[1.2px] text-white/50 hover:border-white/20 hover:text-white"
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
          <div className="flex min-h-[240px] items-center justify-center border border-dashed border-border px-6 py-12">
            <p className="max-w-[440px] text-center font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
              {isStreaming ? "Run in progress" : "Start a thread to inspect portfolio context, market evidence, and guarded trade reasoning."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

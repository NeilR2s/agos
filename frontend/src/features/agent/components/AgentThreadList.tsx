import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import type { AgentThread } from "@/features/agent/types";

type AgentThreadListProps = {
  threads: AgentThread[];
  activeThreadId?: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (threadId: string) => void;
  onNewThread: () => void;
  isLoading: boolean;
};

export function AgentThreadList({
  threads,
  activeThreadId,
  query,
  onQueryChange,
  onSelect,
  onNewThread,
  isLoading,
}: AgentThreadListProps) {
  return (
    <Card className="min-h-[320px] xl:h-[calc(100dvh-220px)]">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Threads</CardTitle>
          <Button variant="outline" size="sm" onClick={onNewThread}>
            New Thread
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 pt-4">
        <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Filter threads" />
        <div className="space-y-2 overflow-y-auto pr-1 xl:flex-1">
          {isLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Loading thread index...</p>
          ) : threads.length ? (
            threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-2 border px-3 py-3 text-left transition-colors",
                    isActive ? "border-white/20 bg-white/5" : "border-border hover:border-white/20 hover:bg-white/5"
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">{thread.mode}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">{formatShortDate(thread.updatedAt)}</span>
                  </div>
                  <p className="line-clamp-2 font-sans text-[14px] leading-[1.5] text-white">{thread.title}</p>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                    <span>{thread.selectedTicker ?? "No ticker"}</span>
                    <span>/</span>
                    <span>{thread.lastRunStatus ?? "idle"}</span>
                  </div>
                  {thread.lastAssistantPreview ? (
                    <p className="line-clamp-2 font-sans text-[13px] leading-[1.5] text-white/50">{thread.lastAssistantPreview}</p>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">No matching threads</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

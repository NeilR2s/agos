import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import { Trash2 } from "lucide-react";
import type { AgentThread } from "@/features/agent/types";

type AgentThreadListProps = {
  threads: AgentThread[];
  activeThreadId?: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (threadId: string) => void;
  onNewThread: () => void;
  onDelete: (threadId: string) => void;
  isLoading: boolean;
};

export function AgentThreadList({
  threads,
  activeThreadId,
  query,
  onQueryChange,
  onSelect,
  onNewThread,
  onDelete,
  isLoading,
}: AgentThreadListProps) {
  return (
    <Card className="min-h-[320px] xl:h-[calc(100dvh-180px)] border-0 bg-transparent shadow-none">
      <CardHeader className="border-b border-white/10 pb-4 px-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-mono uppercase tracking-[2px] text-xs">Threads</CardTitle>
          <Button variant="outline" size="sm" onClick={onNewThread} className="rounded-full border-white/20 hover:bg-white/10">
            + New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 pt-4 px-2">
        <Input 
          value={query} 
          onChange={(event) => onQueryChange(event.target.value)} 
          placeholder="Search..." 
          className="rounded-full bg-white/5 border-transparent focus-visible:ring-1 focus-visible:ring-white/20"
        />
        <div className="space-y-1 overflow-y-auto pr-1 xl:flex-1">
          {isLoading ? (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 p-2">Loading...</p>
          ) : threads.length ? (
            threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <div key={thread.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => onSelect(thread.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-1 rounded-xl px-3 py-3 text-left transition-colors",
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-3 pr-6">
                      <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30 truncate">
                        {thread.selectedTicker || thread.mode}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20 shrink-0">
                        {formatShortDate(thread.updatedAt)}
                      </span>
                    </div>
                    <p className={cn(
                      "line-clamp-2 font-sans text-[13px] leading-[1.5]",
                      isActive ? "text-white" : "text-white/70"
                    )}>
                      {thread.title}
                    </p>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(thread.id);
                    }}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/10 text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100",
                      isActive && "opacity-100"
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/20 p-2">No results</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

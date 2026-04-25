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
  variant?: "panel" | "sidebar";
};

type ThreadGroup = {
  label: string;
  items: AgentThread[];
};

const groupThreads = (threads: AgentThread[]): ThreadGroup[] => {
  const groups = new Map<string, AgentThread[]>();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneWeekAgo = new Date(startOfToday);
  oneWeekAgo.setDate(startOfToday.getDate() - 7);

  for (const thread of threads) {
    const updatedAt = new Date(thread.updatedAt);
    const label = Number.isNaN(updatedAt.getTime())
      ? "Older"
      : updatedAt >= startOfToday
        ? "Today"
        : updatedAt >= oneWeekAgo
          ? "This Week"
          : "Older";

    groups.set(label, [...(groups.get(label) ?? []), thread]);
  }

  return ["Today", "This Week", "Older"]
    .map((label) => ({ label, items: groups.get(label) ?? [] }))
    .filter((group) => group.items.length > 0);
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
  variant = "panel",
}: AgentThreadListProps) {
  const groups = groupThreads(threads);

  if (variant === "sidebar") {
    return (
      <div className="flex h-full min-h-0 flex-col px-2">
        <div className="mb-4">
          <Input
            id="agent-thread-search-sidebar"
            name="agent-thread-search"
            aria-label="Search agent thread history"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search history"
            className="border-white/10 bg-[#171a20] text-[13px] focus-visible:ring-1 focus-visible:ring-white/20"
          />
        </div>

        <div className="scrollbar-hidden min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="px-2 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">Loading...</p>
          ) : groups.length ? (
            groups.map((group) => (
              <section key={group.label} className="space-y-2">
                <p className="px-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/25">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((thread) => {
                    const isActive = thread.id === activeThreadId;
                    return (
                      <div key={thread.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelect(thread.id)}
                          className={cn(
                            "w-full border px-3 py-3 text-left transition-colors",
                            isActive
                              ? "border-white/20 bg-white/[0.06]"
                              : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-sans text-[14px] leading-[1.45] text-white">
                              {thread.title}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[1.2px] text-white/25">
                              {formatShortDate(thread.updatedAt)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.2px] text-white/25">
                            <span>{thread.selectedTicker || thread.mode}</span>
                            {thread.lastRunStatus ? <span>{thread.lastRunStatus}</span> : null}
                          </div>
                          {thread.lastAssistantPreview ? (
                            <p className="mt-2 line-clamp-2 font-sans text-[12px] leading-[1.5] text-white/42">
                              {thread.lastAssistantPreview}
                            </p>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(thread.id);
                          }}
                          className={cn(
                            "absolute right-2 top-2 p-2 text-white/25 transition-colors hover:bg-white/[0.06] hover:text-red-300 opacity-0 group-hover:opacity-100",
                            isActive && "opacity-100"
                          )}
                          aria-label={`Delete ${thread.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="px-2 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/20">No results</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="h-full min-h-0 border-white/10 bg-[#1b1f25]">
      <CardHeader className="border-b border-white/10 px-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-mono text-[11px] uppercase tracking-[1.4px]">Threads</CardTitle>
          <Button variant="outline" size="sm" onClick={onNewThread} className="border-white/20 hover:bg-white/10">
            + New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 px-4 pt-4">
        <Input 
          id="agent-thread-search-panel"
          name="agent-thread-search"
          aria-label="Search agent threads"
          value={query} 
          onChange={(event) => onQueryChange(event.target.value)} 
          placeholder="Search threads..." 
          className="border-white/10 bg-[#20242b] focus-visible:ring-1 focus-visible:ring-white/20"
        />
        <div className="agent-scrollbar space-y-2 overflow-y-auto pr-1 xl:flex-1">
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
                      "flex w-full flex-col items-start gap-2 border px-4 py-4 text-left transition-colors",
                      isActive ? "border-white/20 bg-white/[0.06]" : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
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
                      "absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100",
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

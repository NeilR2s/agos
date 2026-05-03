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
            className="border-input bg-secondary/40 text-[13px] focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="scrollbar-hidden min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="px-2 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Loading...</p>
          ) : groups.length ? (
            groups.map((group) => (
              <section key={group.label} className="space-y-2">
                <p className="px-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map((thread) => {
                    const isActive = thread.id === activeThreadId;
                    return (
                      <div
                        key={thread.id}
                        className={cn(
                          "group relative transition-colors",
                          isActive
                            ? "bg-white/[0.035] border-l-2 border-chart-1"
                            : "border-l-2 border-transparent hover:bg-white/[0.015]"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(thread.id)}
                          className="w-full px-3.5 py-3 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "min-w-0 truncate font-sans text-[14px] leading-none",
                              isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/90"
                            )}>
                              {thread.title}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/60">
                            <span>{thread.mode}</span>
                            <span>·</span>
                            {thread.lastRunStatus ? (
                              <>
                                <span>{thread.lastRunStatus}</span>
                                <span>·</span>
                              </>
                            ) : null}
                            <span>{formatShortDate(thread.updatedAt)}</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(thread.id);
                          }}
                          className={cn(
                            "absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100",
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
            <p className="px-2 py-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No results</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="h-full min-h-0 border-border bg-card">
      <CardHeader className="border-b border-border px-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-mono text-[11px] uppercase tracking-[1.4px]">Threads</CardTitle>
          <Button variant="outline" size="sm" onClick={onNewThread}>
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
          className="border-input bg-secondary/40 focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="agent-scrollbar space-y-2 overflow-y-auto pr-1 xl:flex-1">
          {isLoading ? (
            <p className="p-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Loading...</p>
          ) : threads.length ? (
            threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              return (
                <div key={thread.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => onSelect(thread.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-2 rounded-2xl border px-4 py-4 text-left transition-colors",
                      isActive ? "border-ring/60 bg-accent" : "border-transparent hover:border-border hover:bg-accent/70"
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-3 pr-6">
                      <span className="truncate font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/60">
                        {thread.selectedTicker || thread.mode}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/50">
                        {formatShortDate(thread.updatedAt)}
                      </span>
                    </div>
                    <p className={cn(
                        "line-clamp-2 font-sans text-[13px] leading-[1.5]",
                        isActive ? "text-foreground" : "text-muted-foreground"
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
                      "absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground/70 opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100",
                      isActive && "opacity-100"
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="p-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No results</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

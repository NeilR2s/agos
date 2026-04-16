import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { agentApi } from "@/api/backend/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentComposer } from "@/features/agent/components/AgentComposer";
import { AgentThreadList } from "@/features/agent/components/AgentThreadList";
import { AgentTranscript } from "@/features/agent/components/AgentTranscript";
import { useAgentStream } from "@/features/agent/hooks/useAgentStream";
import type { AgentMessage, AgentMode, AgentRunRequest, AgentSSEEvent, AgentThread, Citation } from "@/features/agent/types";

const allowedModes: AgentMode[] = ["general", "research", "trading"];

const normalizeMode = (value: string | null): AgentMode => {
  if (value && allowedModes.includes(value as AgentMode)) {
    return value as AgentMode;
  }
  return "general";
};

const dedupeEvents = (events: AgentSSEEvent[]) => {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.runId}:${event.sequence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeCitations = (citations: Citation[]) => {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.source}:${citation.label}:${citation.href ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const stream = useAgentStream();
  const [composerValue, setComposerValue] = useState("");
  const [threadQuery, setThreadQuery] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<AgentMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const threadId = searchParams.get("thread");
  const selectedTicker = (searchParams.get("ticker") ?? "").trim().toUpperCase() || null;
  const mode = normalizeMode(searchParams.get("mode"));

  const threadsQuery = useQuery({
    queryKey: ["agent-threads"],
    queryFn: () => agentApi.listThreads(),
  });

  const activeThreadQuery = useQuery({
    queryKey: ["agent-thread", threadId],
    queryFn: () => agentApi.getThread(threadId as string),
    enabled: Boolean(threadId),
  });

  const messagesQuery = useQuery({
    queryKey: ["agent-messages", threadId],
    queryFn: () => agentApi.listMessages(threadId as string),
    enabled: Boolean(threadId),
  });

  const runsQuery = useQuery({
    queryKey: ["agent-runs", threadId],
    queryFn: () => agentApi.listRuns(threadId as string),
    enabled: Boolean(threadId),
  });

  const activeRunId = stream.run?.id ?? runsQuery.data?.[0]?.id ?? null;
  const runEventsQuery = useQuery({
    queryKey: ["agent-run-events", threadId, activeRunId],
    queryFn: () => agentApi.getRunEvents(threadId as string, activeRunId as string),
    enabled: Boolean(threadId && activeRunId),
  });

  const threads = useMemo(() => {
    const items = threadsQuery.data ?? [];
    const normalized = threadQuery.trim().toUpperCase();
    if (!normalized) return items;
    return items.filter((thread) => {
      const haystack = `${thread.title} ${thread.selectedTicker ?? ""} ${thread.lastAssistantPreview ?? ""}`.toUpperCase();
      return haystack.includes(normalized);
    });
  }, [threadQuery, threadsQuery.data]);

  const activeThread = activeThreadQuery.data ?? threadsQuery.data?.find((thread) => thread.id === threadId) ?? null;

  const combinedMessages = useMemo(() => {
    const messages = [...(messagesQuery.data ?? [])];

    if (pendingUserMessage && !messages.some((message) => message.id === pendingUserMessage.id)) {
      messages.push(pendingUserMessage);
    }

    if (stream.completedMessage) {
      const alreadyPresent = messages.some(
        (message) => message.id === stream.completedMessage?.id || (message.runId === stream.completedMessage?.runId && message.role === "assistant")
      );
      if (!alreadyPresent) {
        messages.push(stream.completedMessage);
      }
    } else if (stream.liveMessage && stream.run) {
      messages.push({
        id: `live-${stream.run.id}`,
        threadId: threadId ?? "draft",
        runId: stream.run.id,
        role: "assistant",
        content: stream.liveMessage,
        citations: stream.liveCitations,
        createdAt: new Date().toISOString(),
        tokenCount: null,
        kind: "message",
      });
    }

    return messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [messagesQuery.data, pendingUserMessage, stream.completedMessage, stream.liveCitations, stream.liveMessage, stream.run, threadId]);

  const citations = useMemo(() => {
    const fromMessages = combinedMessages.flatMap((message) => message.citations ?? []);
    return dedupeCitations([...fromMessages, ...stream.liveCitations]);
  }, [combinedMessages, stream.liveCitations]);

  const mergedEvents = useMemo(() => {
    const persisted = (runEventsQuery.data ?? []).map<AgentSSEEvent>((event) => ({
      threadId: event.threadId,
      runId: event.runId,
      timestamp: event.createdAt,
      sequence: event.sequence,
      type: event.type,
      data: event.data,
    }));
    return dedupeEvents([...persisted, ...stream.events]).sort((left, right) => left.sequence - right.sequence);
  }, [runEventsQuery.data, stream.events]);

  const syncQueries = async (nextThreadId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agent-threads"] }),
      queryClient.invalidateQueries({ queryKey: ["agent-thread", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-messages", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-runs", nextThreadId] }),
    ]);
  };

  const handleSelectThread = (nextThreadId: string) => {
    if (stream.isStreaming) {
      stream.cancel();
    }
    stream.reset();
    setPendingUserMessage(null);

    const next = new URLSearchParams(searchParams);
    next.set("thread", nextThreadId);
    const thread = (threadsQuery.data ?? []).find((item) => item.id === nextThreadId);
    if (thread?.selectedTicker) {
      next.set("ticker", thread.selectedTicker);
    } else {
      next.delete("ticker");
    }
    next.set("mode", thread?.mode ?? mode);
    setSearchParams(next, { replace: true });
  };


  const handleDeleteThread = async (id: string) => {
    try {
      await agentApi.deleteThread(id);
      queryClient.setQueryData<AgentThread[]>(["agent-threads"], (current) => 
        (current ?? []).filter(t => t.id !== id)
      );
      if (threadId === id) {
        handleNewThread();
      }
      toast.success("Thread deleted");
    } catch {
      toast.error("Failed to delete thread");
    }
  };

  const handleNewThread = () => {
    if (stream.isStreaming) {
      stream.cancel();
    }
    const next = new URLSearchParams(searchParams);
    next.delete("thread");
    setSearchParams(next, { replace: true });
    setComposerValue("");
    setPendingUserMessage(null);
    stream.reset();
  };

  const handleSubmit = async () => {
    const trimmed = composerValue.trim();
    if (!trimmed || stream.isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      let nextThreadId = threadId;
      let nextSelectedTicker = selectedTicker ?? undefined;

      if (!nextThreadId) {
        const createdThread = await agentApi.createThread({ mode, selectedTicker: selectedTicker ?? undefined });
        nextThreadId = createdThread.id;
        nextSelectedTicker = createdThread.selectedTicker ?? undefined;
        queryClient.setQueryData<AgentThread[]>(["agent-threads"], (current) => [createdThread, ...(current ?? [])]);

        const next = new URLSearchParams(searchParams);
        next.set("thread", createdThread.id);
        next.set("mode", createdThread.mode);
        if (createdThread.selectedTicker) {
          next.set("ticker", createdThread.selectedTicker);
        } else {
          next.delete("ticker");
        }
        setSearchParams(next, { replace: true });
      }

      const message = trimmed;
      setComposerValue("");
      setPendingUserMessage({
        id: `pending-${Date.now()}`,
        threadId: nextThreadId,
        runId: null,
        role: "user",
        content: message,
        citations: [],
        createdAt: new Date().toISOString(),
        tokenCount: message.split(/\s+/).length,
        kind: "message",
      });

      const body: AgentRunRequest = {
        message,
        mode,
        selectedTicker: nextSelectedTicker,
        uiContext: {
          pathname: window.location.pathname,
          search: window.location.search,
        },
      };

      await stream.startRun({ threadId: nextThreadId, body });
      await syncQueries(nextThreadId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Run failed";
      toast.error(detail);
    } finally {
      setPendingUserMessage(null);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <Badge variant="outline" className="border-border text-white/70">
            Agent Console
          </Badge>
          <h1 className="font-sans text-[30px] leading-[1.2]">AGOS Copilot</h1>
          <p className="max-w-[860px] font-sans text-[16px] leading-[1.5] text-white/70">
            Persistent research and trading assistance with live trace streaming, portfolio-aware context, and guarded engine evaluation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[1.4px] text-white/40">
          <Badge variant="outline" className="border-border text-white/70">
            {mode}
          </Badge>
          <span>{selectedTicker ?? "NO TICKER"}</span>
          <span>{threadId ? activeThread?.title ?? threadId : "UNSAVED THREAD"}</span>
          {stream.isStreaming ? (
            <Button variant="outline" size="sm" onClick={stream.cancel}>
              Cancel Run
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <div className="order-2 xl:order-1">
          <AgentThreadList
            threads={threads}
            activeThreadId={threadId}
            query={threadQuery}
            onQueryChange={setThreadQuery}
            onSelect={handleSelectThread}
            onNewThread={handleNewThread}
            onDelete={handleDeleteThread}
            isLoading={threadsQuery.isLoading}
          />
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <AgentTranscript messages={combinedMessages} isStreaming={stream.isStreaming} events={mergedEvents} citations={citations} />
          <AgentComposer
            value={composerValue}
            onChange={setComposerValue}
            onSubmit={handleSubmit}
            isStreaming={stream.isStreaming || isSubmitting}
            selectedTicker={selectedTicker}
            mode={mode}
          />
        </div>

        
      </div>
    </div>
  );
}

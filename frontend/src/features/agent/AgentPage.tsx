import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { agentApi } from "@/api/backend/client";
import { DEFAULT_AGENT_RUN_CONFIG, AGENT_CONFIG_STORAGE_KEY } from "@/features/agent/config";
import { AgentComposer } from "@/features/agent/components/AgentComposer";
import { AgentRunStatus } from "@/features/agent/components/AgentRunStatus";
import { AgentSettingsPanel } from "@/features/agent/components/AgentSettingsPanel";
import { AgentTranscript } from "@/features/agent/components/AgentTranscript";
import { useAgentStream } from "@/features/agent/hooks/useAgentStream";
import { humanizeAgentError } from "@/features/agent/lib/errors";
import { pickDefaultAgentId } from "@/features/agent/lib/traces";
import type { AgentMessage, AgentMode, AgentRunConfig, AgentRunRequest, AgentSSEEvent, AgentThread, Citation } from "@/features/agent/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

const loadStoredConfig = (): AgentRunConfig => {
  if (typeof window === "undefined") {
    return DEFAULT_AGENT_RUN_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(AGENT_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_RUN_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AgentRunConfig>;
    return {
      ...DEFAULT_AGENT_RUN_CONFIG,
      ...parsed,
      tools: {
        ...DEFAULT_AGENT_RUN_CONFIG.tools,
        ...parsed.tools,
      },
      externalCapabilities: Array.isArray(parsed.externalCapabilities)
        ? parsed.externalCapabilities
        : DEFAULT_AGENT_RUN_CONFIG.externalCapabilities,
      skills: Array.isArray(parsed.skills) ? parsed.skills : DEFAULT_AGENT_RUN_CONFIG.skills,
    };
  } catch {
    return DEFAULT_AGENT_RUN_CONFIG;
  }
};

export function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const stream = useAgentStream();
  const cancelStream = stream.cancel;
  const isStreamRunning = stream.isStreaming;
  const resetStream = stream.reset;
  const [composerValue, setComposerValue] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState<AgentMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"run" | "controls" | null>(null);
  const [runConfig, setRunConfig] = useState<AgentRunConfig>(() => loadStoredConfig());
  const isSubmittingRef = useRef(false);
  const ignoreNextThreadChangeRef = useRef(false);
  const previousThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(AGENT_CONFIG_STORAGE_KEY, JSON.stringify(runConfig));
  }, [runConfig]);

  const threadId = searchParams.get("thread");
  const selectedTicker = (searchParams.get("ticker") ?? "").trim().toUpperCase() || null;
  const mode = normalizeMode(searchParams.get("mode"));

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

  const activeThread = activeThreadQuery.data ?? null;
  const activeRun = stream.run ?? runsQuery.data?.[0] ?? null;

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
        agentId: "synthesizer",
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
      agentId: event.agentId ?? undefined,
      agentLabel: event.agentLabel ?? undefined,
      agentRole: event.agentRole ?? undefined,
      parentAgentId: event.parentAgentId ?? undefined,
      data: event.data,
    }));
    return dedupeEvents([...persisted, ...stream.events]).sort((left, right) => left.sequence - right.sequence);
  }, [runEventsQuery.data, stream.events]);

  useEffect(() => {
    if (!mergedEvents.length) {
      setSelectedAgentId(null);
      return;
    }

    const nextDefault = pickDefaultAgentId(mergedEvents);
    setSelectedAgentId((current) => {
      if (!current) return nextDefault;
      const stillExists = mergedEvents.some((event) => (event.agentId ?? "agos-runtime") === current);
      return stillExists ? current : nextDefault;
    });
  }, [mergedEvents]);

  useEffect(() => {
    const previousThreadId = previousThreadIdRef.current;
    if (previousThreadId === threadId) {
      return;
    }

    previousThreadIdRef.current = threadId;
    setSelectedAgentId(null);

    if (ignoreNextThreadChangeRef.current) {
      ignoreNextThreadChangeRef.current = false;
      return;
    }

    setComposerValue("");
    setPendingUserMessage(null);
    setActivePanel(null);

    if (isStreamRunning) {
      cancelStream();
      return;
    }

    resetStream();
  }, [threadId, cancelStream, isStreamRunning, resetStream]);

  const syncQueries = async (nextThreadId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agent-threads"] }),
      queryClient.invalidateQueries({ queryKey: ["agent-thread", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-messages", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-runs", nextThreadId] }),
    ]);
  };

  const setSearchParamsTransition = (next: URLSearchParams) => {
    startTransition(() => {
      setSearchParams(next, { replace: true });
    });
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
        ignoreNextThreadChangeRef.current = true;
        setSearchParamsTransition(next);
      }

      const message = trimmed;
      setComposerValue("");
      setSelectedAgentId(null);
      setPendingUserMessage({
        id: `pending-${Date.now()}`,
        threadId: nextThreadId,
        runId: null,
        agentId: null,
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
        config: runConfig,
        uiContext: {
          pathname: window.location.pathname,
          search: window.location.search,
        },
      };

      await stream.startRun({ threadId: nextThreadId, body });
      await syncQueries(nextThreadId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Run failed";
      toast.error(humanizeAgentError(detail) ?? detail);
    } finally {
      setPendingUserMessage(null);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const agentCount = useMemo(() => {
    const fromRunUsage = activeRun?.usage?.agentCount;
    if (typeof fromRunUsage === "number") return fromRunUsage;
    const ids = new Set(mergedEvents.map((event) => event.agentId).filter(Boolean));
    return ids.size;
  }, [activeRun?.usage, mergedEvents]);

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden bg-background text-foreground lg:h-[calc(100dvh-1px)]">
      <header className="border-b border-white/10 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <Badge variant="outline" className="border-border text-white/70">
              Agent Console
            </Badge>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <h1 className="font-sans text-[24px] leading-[1.1] text-white md:text-[28px]">AGOS Copilot</h1>
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                {activeThread?.title ?? "new session"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-white/35">
            <span>{mode}</span>
            <span>/</span>
            <span>{selectedTicker ?? "no ticker"}</span>
            <span>/</span>
            <span>{runConfig.maxAgents} agents max</span>
            {stream.isStreaming ? (
              <Button variant="outline" size="sm" onClick={stream.cancel}>
                Cancel Run
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex flex-1 flex-col gap-5 px-5 py-5 md:px-6">
        <AgentTranscript
          messages={combinedMessages}
          isStreaming={stream.isStreaming}
          events={mergedEvents}
          citations={citations}
          activeRunId={activeRunId}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />

        {activePanel ? (
          <section className="border border-white/10 bg-[#171a20]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-white/30">
                  {activePanel === "run" ? "Run Details" : "Controls"}
                </p>
                <p className="mt-1 font-sans text-[13px] leading-[1.5] text-white/55">
                  {activePanel === "run"
                    ? "Status, timing, and model telemetry for the active run."
                    : "Adjust model, generation, and tool settings without losing transcript space."}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setActivePanel(null)}>
                Close
              </Button>
            </div>

            <div className="agent-scrollbar max-h-[360px] overflow-y-auto p-5">
              {activePanel === "run" ? (
                <AgentRunStatus
                  run={activeRun}
                  isStreaming={stream.isStreaming}
                  error={stream.error}
                  citationCount={citations.length}
                  selectedTicker={selectedTicker}
                  agentCount={agentCount}
                />
              ) : (
                <AgentSettingsPanel config={runConfig} mode={mode} onChange={setRunConfig} />
              )}
            </div>
          </section>
        ) : null}

        <AgentComposer
          value={composerValue}
          onChange={setComposerValue}
          onSubmit={handleSubmit}
          onCancel={stream.cancel}
          onToggleRunPanel={() => setActivePanel((current) => (current === "run" ? null : "run"))}
          onToggleControlsPanel={() => setActivePanel((current) => (current === "controls" ? null : "controls"))}
          activePanel={activePanel}
          isStreaming={stream.isStreaming || isSubmitting}
          selectedTicker={selectedTicker}
          mode={mode}
          config={runConfig}
        />
      </div>
    </div>
  );
}

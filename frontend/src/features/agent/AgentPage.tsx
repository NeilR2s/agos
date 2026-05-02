import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { agentApi } from "@/api/backend/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_AGENT_RUN_CONFIG, AGENT_CONFIG_STORAGE_KEY } from "@/features/agent/config";
import { AgentComposer } from "@/features/agent/components/AgentComposer";
import { AgentRunStatus } from "@/features/agent/components/AgentRunStatus";
import { AgentSettingsPanel } from "@/features/agent/components/AgentSettingsPanel";
import { AgentTracePanel } from "@/features/agent/components/AgentTracePanel";
import { AgentTranscript } from "@/features/agent/components/AgentTranscript";
import { useAgentStream } from "@/features/agent/hooks/useAgentStream";
import { humanizeAgentError } from "@/features/agent/lib/errors";
import { pickDefaultAgentId } from "@/features/agent/lib/traces";
import type { AgentMessage, AgentMode, AgentRun, AgentRunConfig, AgentRunRequest, AgentSSEEvent, AgentThread, Citation } from "@/features/agent/types";
import { formatShortDate } from "@/lib/format";

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

const resolveQueryError = (error: unknown, fallback: string) => {
  if (!error) {
    return null;
  }

  const detail = error instanceof Error ? error.message : fallback;
  return humanizeAgentError(detail) ?? detail;
};

const formatRunLabel = (run: AgentRun, index: number) => {
  const ordinal = String(index + 1).padStart(2, "0");
  return `Run ${ordinal} / ${formatShortDate(run.startedAt)}`;
};

export function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const stream = useAgentStream();
  const resetStream = stream.reset;
  const cancelStream = stream.cancel;
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
  const selectedRunId = searchParams.get("run");
  const selectedTicker = (searchParams.get("ticker") ?? "").trim().toUpperCase() || null;
  const mode = normalizeMode(searchParams.get("mode"));

  const setSearchParamsTransition = useCallback((next: URLSearchParams) => {
    startTransition(() => {
      setSearchParams(next, { replace: true });
    });
  }, [setSearchParams]);

  const patchSearchParams = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    let changed = false;

    Object.entries(patch).forEach(([key, value]) => {
      const current = next.get(key);
      if (!value) {
        if (current !== null) {
          next.delete(key);
          changed = true;
        }
        return;
      }

      if (current !== value) {
        next.set(key, value);
        changed = true;
      }
    });

    if (changed) {
      setSearchParamsTransition(next);
    }
  }, [searchParams, setSearchParamsTransition]);

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

  const availableRuns = useMemo(() => {
    const runs = runsQuery.data ?? [];
    if (stream.run && !runs.some((candidate) => candidate.id === stream.run?.id)) {
      return [stream.run, ...runs];
    }
    return runs;
  }, [runsQuery.data, stream.run]);

  const selectedRunExists = selectedRunId ? availableRuns.some((run) => run.id === selectedRunId) : false;
  const activeRunId = stream.status === "running" && stream.run?.id
    ? stream.run.id
    : selectedRunExists
      ? selectedRunId
      : stream.run?.id ?? availableRuns[0]?.id ?? null;

  const runEventsQuery = useQuery({
    queryKey: ["agent-run-events", threadId, activeRunId],
    queryFn: () => agentApi.getRunEvents(threadId as string, activeRunId as string),
    enabled: Boolean(threadId && activeRunId),
  });

  const activeThread = activeThreadQuery.data ?? null;
  const activeRun = useMemo(() => {
    if (stream.run?.id === activeRunId) {
      return stream.run;
    }

    return availableRuns.find((candidate) => candidate.id === activeRunId) ?? null;
  }, [activeRunId, availableRuns, stream.run]);
  const activeRunIndex = activeRun ? availableRuns.findIndex((run) => run.id === activeRun.id) : -1;
  const activeRunLabel = activeRun && activeRunIndex >= 0 ? formatRunLabel(activeRun, activeRunIndex) : null;

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
    } else if (stream.run && stream.status === "running") {
      messages.push({
        id: `live-${stream.run.id}`,
        threadId: threadId ?? "draft",
        runId: stream.run.id,
        agentId: "synthesizer",
        role: "assistant",
        content: stream.liveMessage ?? "",
        citations: stream.liveCitations,
        createdAt: new Date().toISOString(),
        tokenCount: null,
        kind: "message",
      });
    }

    return messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [messagesQuery.data, pendingUserMessage, stream.completedMessage, stream.liveCitations, stream.liveMessage, stream.run, stream.status, threadId]);

  const activeRunMessages = useMemo(
    () => combinedMessages.filter((message) => message.runId === activeRunId),
    [activeRunId, combinedMessages]
  );

  const citations = useMemo(
    () => dedupeCitations(activeRunMessages.flatMap((message) => message.citations ?? [])),
    [activeRunMessages]
  );

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
    const liveEvents = stream.run?.id === activeRunId ? stream.events : [];
    return dedupeEvents([...persisted, ...liveEvents]).sort((left, right) => left.sequence - right.sequence);
  }, [activeRunId, runEventsQuery.data, stream.events, stream.run?.id]);

  const activeRunError = useMemo(() => {
    if (stream.run?.id === activeRunId && stream.error) {
      return stream.error;
    }

    if (typeof activeRun?.error === "string" && activeRun.error.trim()) {
      return humanizeAgentError(activeRun.error) ?? activeRun.error;
    }

    return null;
  }, [activeRun?.error, activeRunId, stream.error, stream.run?.id]);

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
    resetStream();
  }, [threadId, resetStream]);

  useEffect(() => {
    if (!stream.run?.id) {
      return;
    }

    patchSearchParams({ run: stream.run.id });
  }, [patchSearchParams, stream.run?.id]);

  useEffect(() => {
    if (!selectedRunId || stream.run?.id === selectedRunId) {
      return;
    }

    if (availableRuns.some((run) => run.id === selectedRunId)) {
      return;
    }

    patchSearchParams({ run: availableRuns[0]?.id ?? null });
  }, [availableRuns, patchSearchParams, selectedRunId, stream.run?.id]);

  const syncQueries = useCallback(async (nextThreadId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agent-threads"] }),
      queryClient.invalidateQueries({ queryKey: ["agent-thread", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-messages", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-runs", nextThreadId] }),
      queryClient.invalidateQueries({ queryKey: ["agent-run-events", nextThreadId] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    if (!threadId || (stream.status !== "completed" && stream.status !== "cancelled")) {
      return;
    }

    const refreshSoon = window.setTimeout(() => {
      void syncQueries(threadId);
    }, 1200);
    const refreshLater = window.setTimeout(() => {
      void syncQueries(threadId);
    }, 4000);

    return () => {
      window.clearTimeout(refreshSoon);
      window.clearTimeout(refreshLater);
    };
  }, [stream.status, syncQueries, threadId]);

  const handleStartFreshThread = () => {
    resetStream();
    setPendingUserMessage(null);
    setSelectedAgentId(null);
    patchSearchParams({ thread: null, run: null });
  };

  const handleStopStreaming = () => {
    const runIdToCancel = stream.run?.id ?? null;
    cancelStream();
    if (threadId && runIdToCancel) {
      void agentApi.cancelRun(threadId, runIdToCancel)
        .catch((error) => {
          const detail = error instanceof Error ? error.message : "Run cancellation failed";
          toast.error(humanizeAgentError(detail) ?? detail);
        })
        .finally(() => {
          void syncQueries(threadId);
        });
      return;
    }

    if (threadId) {
      void syncQueries(threadId);
    }
  };

  const handleSelectRun = (runId: string) => {
    patchSearchParams({ run: runId });
    setActivePanel("run");
  };

  const handleSubmit = async () => {
    const trimmed = composerValue.trim();
    if (!trimmed || stream.isStreaming || isSubmittingRef.current) return;

    if (threadId && activeThreadQuery.isError) {
      toast.error("The active thread is unavailable. Start a new session to continue.");
      return;
    }

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
        next.delete("run");
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
    const ids = new Set(
      mergedEvents
        .filter((event) => event.agentRole !== "runtime" && event.agentRole !== "synthesizer")
        .map((event) => event.agentId)
        .filter(Boolean)
    );
    return ids.size;
  }, [activeRun?.usage, mergedEvents]);

  const threadErrorMessage = threadId ? resolveQueryError(activeThreadQuery.error, "Thread unavailable") : null;
  const messageErrorMessage = threadId ? resolveQueryError(messagesQuery.error, "Messages unavailable") : null;
  const runErrorMessage = threadId ? resolveQueryError(runsQuery.error, "Run history unavailable") : null;
  const runEventsErrorMessage = activeRunId ? resolveQueryError(runEventsQuery.error, "Trace unavailable") : null;
  const stopStreamNotice =
    stream.status === "cancelled" && stream.run?.id === activeRunId
      ? "Cancellation was requested. Refreshes will continue briefly so final run status, titles, and any persisted output can still appear."
      : null;
  const supplementalErrors = [messageErrorMessage, runErrorMessage, runEventsErrorMessage].filter(Boolean) as string[];

  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden bg-background text-foreground lg:h-dvh">
      <header className="shrink-0 border-b border-border/60 bg-background/90 px-3 py-2 backdrop-blur-md md:px-4">
        <div className="flex min-h-[44px] flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Frontier Agent</span>
            <h1 className="font-sans text-[20px] leading-none text-foreground md:text-[22px]">AGOS</h1>
            <p className="max-w-[68vw] truncate font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70 lg:max-w-[520px]">
              {activeThread?.title ?? "new session"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">
            <span>{mode}</span>
            <span>/</span>
            <span>{selectedTicker ?? "no ticker"}</span>
            <span>/</span>
            <span>{runConfig.maxAgents} workers</span>
            {runsQuery.isFetching ? <span>/ refreshing</span> : null}
            {activeRun ? (
              <button
                type="button"
                onClick={() => setActivePanel("run")}
                className="rounded-full border border-border px-2.5 py-1 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
              >
                {activeRunLabel ?? "Run"} / {activeRun.status}
              </button>
            ) : threadId && runsQuery.isLoading ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground/70">loading runs</span>
            ) : null}
            {stream.status === "cancelled" && stream.run?.id === activeRunId ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">cancelled</span>
            ) : null}
          </div>
        </div>
      </header>

      {threadErrorMessage ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-5 md:px-6">
          <div className="w-full max-w-[640px] rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-6">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-destructive">Thread Unavailable</p>
            <h2 className="mt-3 font-sans text-[24px] leading-[1.1] text-foreground">The selected AGOS session could not be loaded.</h2>
            <p className="mt-3 font-sans text-[14px] leading-[1.7] text-foreground/75">{threadErrorMessage}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleStartFreshThread}>
                Start Fresh Session
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => activeThreadQuery.refetch()}>
                Retry Load
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex flex-1 flex-col gap-2.5 px-3 py-2.5 md:px-4">
          {stopStreamNotice ? (
            <section className="mx-auto w-full max-w-[900px] rounded-2xl border border-chart-3/40 bg-chart-3/10 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-chart-3">Stream Stopped</p>
              <p className="mt-2 font-sans text-[13px] leading-[1.6] text-foreground/80">{stopStreamNotice}</p>
            </section>
          ) : null}

          {supplementalErrors.length ? (
            <div className="space-y-2">
              {supplementalErrors.map((message) => (
                <section key={message} className="mx-auto w-full max-w-[900px] rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                  <p className="font-sans text-[13px] leading-[1.6] text-destructive">{message}</p>
                </section>
              ))}
            </div>
          ) : null}

          <AgentTranscript
            messages={combinedMessages}
            isStreaming={stream.isStreaming}
            events={mergedEvents}
            citations={citations}
            activeRunId={activeRunId}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
          />

          <AgentComposer
            value={composerValue}
            onChange={setComposerValue}
            onSubmit={handleSubmit}
            onCancel={handleStopStreaming}
            onToggleRunPanel={() => setActivePanel((current) => (current === "run" ? null : "run"))}
            onToggleControlsPanel={() => setActivePanel((current) => (current === "controls" ? null : "controls"))}
            activePanel={activePanel}
            isBusy={stream.isStreaming || isSubmitting}
            isStreaming={stream.isStreaming}
            streamStatus={stream.status}
            selectedTicker={selectedTicker}
            mode={mode}
            config={runConfig}
          />
        </div>
      )}

      <Dialog
        open={Boolean(activePanel)}
        onOpenChange={(open) => {
          if (!open) {
            setActivePanel(null);
          }
        }}
      >
        <DialogContent
          className="overflow-hidden rounded-[28px] border-border bg-popover/95 p-0 shadow-none"
          style={{ width: activePanel === "run" ? "min(94vw, 1180px)" : "min(94vw, 1040px)", maxWidth: "none" }}
        >
          <DialogHeader className="border-b border-border bg-background/25 px-5 py-4 pr-16 text-left">
            <div>
              <DialogTitle className="font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">
                {activePanel === "run" ? "Run Audit" : "Controls"}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-[720px] font-sans text-[13px] normal-case leading-[1.5] text-muted-foreground">
                {activePanel === "run"
                  ? "Inspect persisted run telemetry, worker summaries, and the agent-by-agent event trail."
                  : "Adjust model, generation, and tool settings without losing transcript space."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="scrollbar-hidden max-h-[min(82vh,900px)] overflow-y-auto p-5">
            {activePanel === "run" ? (
              <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <section className="rounded-[20px] border border-border bg-card px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Run History</p>
                      {runsQuery.isFetching ? <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">Refreshing</span> : null}
                    </div>
                    <div className="agent-scrollbar mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                      {availableRuns.length ? (
                        availableRuns.map((run, index) => {
                          const isActive = run.id === activeRunId;
                          return (
                            <button
                              key={run.id}
                              type="button"
                              onClick={() => handleSelectRun(run.id)}
                              className={[
                                "w-full rounded-[18px] border px-3 py-3 text-left transition-colors",
                                isActive ? "border-ring/60 bg-accent" : "border-border hover:border-ring/60 hover:bg-accent/70",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{formatRunLabel(run, index)}</p>
                                <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/75">{run.status}</span>
                              </div>
                              <p className="mt-2 line-clamp-2 font-sans text-[13px] leading-[1.45] text-foreground/80">{run.summary ?? "Inspect run trace"}</p>
                              <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">{run.mode}</p>
                            </button>
                          );
                        })
                      ) : (
                        <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No persisted runs yet</p>
                      )}
                    </div>
                  </section>
                  <AgentRunStatus
                    run={activeRun}
                    isStreaming={stream.isStreaming && stream.run?.id === activeRunId}
                    error={activeRunError}
                    citationCount={citations.length}
                    selectedTicker={activeRun?.selectedTicker ?? selectedTicker}
                    agentCount={agentCount}
                  />
                  {activeRun ? (
                    <div className="rounded-[20px] border border-border bg-card px-4 py-4">
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Run Context</p>
                      <div className="mt-3 space-y-2 font-sans text-[13px] leading-[1.6] text-foreground/75">
                        <p>Mode: {activeRun.mode}</p>
                        <p>Ticker: {activeRun.selectedTicker ?? "none"}</p>
                        <p>Started: {formatShortDate(activeRun.startedAt)}</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <AgentTracePanel
                  key={activeRunId ?? "no-run"}
                  events={mergedEvents}
                  run={activeRun}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                  streamNotice={stopStreamNotice}
                />
              </div>
            ) : (
              <AgentSettingsPanel config={runConfig} mode={mode} onChange={setRunConfig} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

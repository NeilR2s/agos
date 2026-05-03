import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { agentApi } from "@/api/backend/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_AGENT_RUN_CONFIG, AGENT_CONFIG_STORAGE_KEY } from "@/features/agent/config";
import { AgentComposer } from "@/features/agent/components/AgentComposer";
import { AgentOutputTabs } from "@/features/agent/components/AgentOutputTabs";
import { AgentSettingsPanel } from "@/features/agent/components/AgentSettingsPanel";
import { AgentTracePanel } from "@/features/agent/components/AgentTracePanel";
import { AgentTranscript } from "@/features/agent/components/AgentTranscript";
import { useAgentStream } from "@/features/agent/hooks/useAgentStream";
import { humanizeAgentError } from "@/features/agent/lib/errors";
import { pickDefaultAgentId, stripMarkdownArtifacts } from "@/features/agent/lib/traces";
import type { AgentMessage, AgentMode, AgentRun, AgentRunConfig, AgentRunRequest, AgentSSEEvent, AgentThread, Citation } from "@/features/agent/types";
import { formatDurationMs, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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

    if (pendingUserMessage) {
      const pendingMessage = {
        ...pendingUserMessage,
        runId: pendingUserMessage.runId ?? stream.run?.id ?? null,
      };
      const alreadyPresent = messages.some(
        (message) =>
          message.id === pendingMessage.id ||
          (message.role === "user" &&
            pendingMessage.runId &&
            message.runId === pendingMessage.runId &&
            message.content === pendingMessage.content)
      );

      if (!alreadyPresent) {
        messages.push(pendingMessage);
      }
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

  const activeRunAssistantMessage = useMemo(() => {
    const assistantMessages = activeRunMessages.filter((message) => message.role === "assistant");
    const structuredMessages = assistantMessages.filter((message) => message.structuredOutput);
    return structuredMessages[structuredMessages.length - 1] ?? assistantMessages[assistantMessages.length - 1] ?? null;
  }, [activeRunMessages]);

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

  const toolCount = useMemo(
    () => mergedEvents.filter((event) => event.type === "tool.completed").length,
    [mergedEvents]
  );

  const copyAuditArtifact = useCallback(async (label: string, value: string) => {
    if (!value.trim()) {
      toast.error(`${label} is not available for this run.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`${label} copy failed.`);
    }
  }, []);

  const threadErrorMessage = threadId ? resolveQueryError(activeThreadQuery.error, "Thread resolution failed") : null;
  const messageErrorMessage = threadId ? resolveQueryError(messagesQuery.error, "Message retrieval failed") : null;
  const runErrorMessage = threadId ? resolveQueryError(runsQuery.error, "Run history retrieval failed") : null;
  const runEventsErrorMessage = activeRunId ? resolveQueryError(runEventsQuery.error, "Trace retrieval failed") : null;
  const stopStreamNotice =
    stream.status === "cancelled" && stream.run?.id === activeRunId
      ? "Cancellation was requested. Refreshes will continue briefly so final run status, titles, and any persisted output can still appear."
      : null;
  const supplementalErrors = [messageErrorMessage, runErrorMessage, runEventsErrorMessage].filter(Boolean) as string[];
  const isLanding = combinedMessages.length === 0 && !threadErrorMessage;

  return (
    <div className="relative flex h-[calc(100dvh-57px)] flex-col overflow-hidden bg-background text-foreground lg:h-dvh">
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--foreground)_7%,transparent),transparent_66%)]", isLanding ? "h-28 opacity-60" : "h-40")} aria-hidden="true" />

      <header className={cn("relative z-10 shrink-0 px-3 py-2 backdrop-blur-xl md:px-5", isLanding ? "border-b border-border/25 bg-background/35" : "border-b border-border/50 bg-background/70")}>
        <div className="mx-auto flex min-h-[44px] w-full max-w-[1180px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden size-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 font-mono text-[10px] uppercase tracking-[1.2px] text-foreground sm:flex">
              A
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="font-sans text-[18px] leading-none tracking-[-0.02em] text-foreground md:text-[20px]">AGOS</h1>
                <span className="hidden rounded-full border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[1.4px] text-muted-foreground sm:inline-flex">
                  Frontier Agent
                </span>
              </div>
              <p className="mt-1 max-w-[58vw] truncate font-sans text-[12px] leading-none text-muted-foreground md:max-w-[520px]">
                {activeThread?.title ?? "New chat"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">
            <span className="hidden rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 sm:inline-flex">{mode}</span>
            <span className="hidden rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 md:inline-flex">{selectedTicker ?? "no ticker"}</span>
            <span className="hidden rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 lg:inline-flex">{runConfig.maxAgents} workers</span>
            {runsQuery.isFetching ? <span className="hidden rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 lg:inline-flex">refreshing</span> : null}
            {activeRun ? (
              <button
                type="button"
                onClick={() => setActivePanel("run")}
                className="rounded-full border border-border bg-secondary/45 px-2.5 py-1 text-muted-foreground transition-colors hover:border-ring/60 hover:bg-accent hover:text-foreground"
              >
                {activeRunLabel ?? "Run"} / {activeRun.status}
              </button>
            ) : threadId && runsQuery.isLoading ? (
              <span className="rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 text-muted-foreground/70">loading runs</span>
            ) : null}
            {stream.status === "cancelled" && stream.run?.id === activeRunId ? (
              <span className="rounded-full border border-border/70 bg-secondary/35 px-2.5 py-1 text-muted-foreground">cancelled</span>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={handleStartFreshThread} disabled={stream.isStreaming || isSubmitting} className="h-8 rounded-full border-border bg-secondary/35 px-3 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
              New Chat
            </Button>
          </div>
        </div>
      </header>

      {threadErrorMessage ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-5 md:px-6">
          <div className="w-full max-w-[640px] rounded-3xl border border-destructive/40 bg-destructive/10 px-6 py-6">
            <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-destructive">Thread Unavailable</p>
            <h2 className="mt-3 font-sans text-[24px] leading-[1.1] text-foreground">AGOS session unavailable.</h2>
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
        <div className={cn("relative z-10 min-h-0 flex flex-1 flex-col overflow-hidden", isLanding ? "justify-center gap-6 px-4 py-8 md:gap-7 md:py-10" : "px-2 py-2 md:px-4 md:py-3")}>
          {stopStreamNotice ? (
            <section className="mx-auto mb-2 w-full max-w-[900px] rounded-2xl border border-chart-3/40 bg-chart-3/10 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-chart-3">Stream Stopped</p>
              <p className="mt-2 font-sans text-[13px] leading-[1.6] text-foreground/80">{stopStreamNotice}</p>
            </section>
          ) : null}

          {supplementalErrors.length ? (
            <div className="mb-2 space-y-2">
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
            onSelectRun={handleSelectRun}
            isLanding={isLanding}
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
            isLanding={isLanding}
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
          className="gap-0 overflow-hidden rounded-[18px] border-border bg-popover/95 p-0 shadow-none"
          style={{ width: activePanel === "run" ? "min(94vw, 1180px)" : "min(94vw, 1040px)", maxWidth: "none" }}
        >
          <DialogHeader className="border-b border-border/70 bg-background/20 px-5 py-4 pr-16 text-left">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <DialogTitle className="font-mono text-[11px] uppercase tracking-[1.4px] text-foreground">
                  {activePanel === "run" ? "Run Audit" : "Controls"}
                </DialogTitle>
                <DialogDescription className="mt-1 max-w-[720px] font-sans text-[13px] normal-case leading-[1.5] text-muted-foreground">
                  {activePanel === "run"
                    ? "Audit trail, worker summaries, evidence, and event trace."
                    : "Configure model parameters and tool capabilities."}
                </DialogDescription>
              </div>

              {activePanel === "run" ? (
                <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[1.25px]">
                  <button
                    type="button"
                    onClick={() => void copyAuditArtifact("Transcript", activeRunAssistantMessage?.content ?? "")}
                    className="rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
                  >
                    Transcript
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyAuditArtifact("Audit JSON", activeRunAssistantMessage?.structuredOutput ? JSON.stringify(activeRunAssistantMessage.structuredOutput, null, 2) : "")}
                    className="rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
                  >
                    Audit JSON
                  </button>
                  <DialogClose className="rounded-full border border-border/70 px-3 py-1.5 text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground">
                    Close
                  </DialogClose>
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <div className={cn("min-h-0", activePanel === "run" ? "h-[min(82vh,780px)] overflow-hidden" : "scrollbar-hidden max-h-[min(82vh,900px)] overflow-y-auto p-5")}>
            {activePanel === "run" ? (
              <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)] xl:grid-rows-1">
                <aside className="flex min-h-0 flex-col border-b border-border/60 bg-background/10 p-4 xl:border-b-0 xl:border-r xl:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground">Run History</p>
                    </div>
                    {runsQuery.isFetching ? <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground/70">Sync</span> : null}
                  </div>
                  <div className="scrollbar-hidden mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                    {availableRuns.length ? (
                      availableRuns.map((run, index) => {
                        const isActive = run.id === activeRunId;
                        return (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => handleSelectRun(run.id)}
                            className={cn(
                              "grid w-full grid-cols-[26px_minmax(0,1fr)] gap-3 border-b border-border/45 py-3 pr-2 text-left transition-colors last:border-b-0 hover:bg-accent/20",
                              isActive && "bg-accent/30"
                            )}
                          >
                            <span className={cn("h-full min-h-11 border-l", isActive ? "border-chart-1" : "border-border/70")}>
                              <span className="sr-only">{isActive ? "Selected" : "Run"}</span>
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center justify-between gap-3">
                                <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                                <span className={cn("font-mono text-[9px] uppercase tracking-[1.2px]", getRunStatusTone(run.status))}>{run.status}</span>
                              </span>
                              <span className="mt-2 block line-clamp-2 break-words font-sans text-[13px] leading-[1.45] text-foreground/82">{stripMarkdownArtifacts(run.summary) || "AGOS Synthesis"}</span>
                              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/65">{run.mode} · {formatDurationMs(run.latencyMs)}</span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="font-mono text-[10px] uppercase tracking-[1.4px] text-muted-foreground/70">No persisted runs yet</p>
                    )}
                  </div>
                </aside>

                <div className="scrollbar-hidden min-h-0 min-w-0 space-y-5 overflow-y-auto p-4 md:p-5">
                  <RunTelemetryStrip
                    run={activeRun}
                    isStreaming={stream.isStreaming && stream.run?.id === activeRunId}
                    error={activeRunError}
                    citationCount={citations.length}
                    selectedTicker={activeRun?.selectedTicker ?? selectedTicker}
                    agentCount={agentCount}
                    toolCount={toolCount}
                  />

                  {activeRunAssistantMessage?.structuredOutput ? (
                    <AgentOutputTabs
                      output={activeRunAssistantMessage.structuredOutput}
                      markdown={activeRunAssistantMessage.content}
                      traceNode={
                        <AgentTracePanel
                          key={activeRunId ?? "no-run"}
                          events={mergedEvents}
                          run={activeRun}
                          selectedAgentId={selectedAgentId}
                          onSelectAgent={setSelectedAgentId}
                          streamNotice={stopStreamNotice}
                        />
                      }
                    />
                  ) : (
                    <>
                      <RunMessagePanel message={activeRunAssistantMessage} />
                      <AgentTracePanel
                        key={activeRunId ?? "no-run"}
                        events={mergedEvents}
                        run={activeRun}
                        selectedAgentId={selectedAgentId}
                        onSelectAgent={setSelectedAgentId}
                        streamNotice={stopStreamNotice}
                      />
                    </>
                  )}
                </div>
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

function RunTelemetryStrip({
  run,
  isStreaming,
  error,
  citationCount,
  selectedTicker,
  agentCount,
  toolCount,
}: {
  run: AgentRun | null;
  isStreaming: boolean;
  error: string | null;
  citationCount: number;
  selectedTicker?: string | null;
  agentCount: number;
  toolCount: number;
}) {
  const config = run?.config ?? {};
  const modelLabel = typeof config.modelLabel === "string" ? config.modelLabel : run?.model ?? "---";
  const thinkingLevel = typeof config.thinkingLevel === "string" ? config.thinkingLevel : "---";
  const statusLabel = error ? "error" : isStreaming ? "streaming" : run?.status ?? "idle";
  const started = formatShortDate(run?.startedAt);

  return (
    <section className="space-y-3 border-b border-border/60 pb-5">
      <div className="min-w-0">
        <h2 className="line-clamp-2 break-words font-sans text-[22px] font-medium leading-[1.15] tracking-[-0.03em] text-foreground">
          {stripMarkdownArtifacts(run?.summary) || "AGOS Synthesis"}
        </h2>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[1.25px] text-muted-foreground/75">
          AGOS Synthesis · {run?.mode ?? "---"} · <span className={getRunStatusTone(statusLabel)}>{statusLabel}</span> · {formatDurationMs(run?.latencyMs)} · {agentCount} agents · {toolCount} tools · {citationCount} sources
        </p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[1.2px] text-muted-foreground/55">
          {selectedTicker ?? run?.selectedTicker ?? "No ticker"} · {modelLabel} · {thinkingLevel} thinking · Started {started}
        </p>
      </div>
      {error ? <p className="border-l border-destructive/50 px-3 py-1.5 font-sans text-[13px] leading-[1.6] text-destructive">{error}</p> : null}
    </section>
  );
}

function getRunStatusTone(status: string) {
  if (status === "error" || status === "failed") return "text-destructive";
  if (status === "streaming" || status === "running") return "text-chart-1";
  if (status === "completed") return "text-chart-2";
  return "text-muted-foreground";
}

function RunMessagePanel({ message }: { message: AgentMessage | null }) {
  return (
    <section className="border-y border-border/60 py-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">Run Information</p>
          <p className="mt-1 font-sans text-[13px] leading-[1.45] text-muted-foreground/80">
            {message ? "Assistant transcript for the selected run." : "No assistant output has been persisted for this run yet."}
          </p>
        </div>
      </div>

      {message?.content ? (
        <div className="mt-4 whitespace-pre-wrap break-words font-sans text-[14px] leading-[1.7] text-foreground/85">{stripMarkdownArtifacts(message.content)}</div>
      ) : (
        <p className="mt-4 font-sans text-[14px] leading-[1.7] text-muted-foreground">Select another run or wait for the stream to finish syncing.</p>
      )}
    </section>
  );
}

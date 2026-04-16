import { useCallback, useEffect, useRef, useState } from "react";

import { agentApi } from "@/api/backend/client";
import type { AgentMessage, AgentRun, AgentRunRequest, AgentSSEEvent, Citation } from "@/features/agent/types";

type StartRunInput = {
  threadId: string;
  body: AgentRunRequest;
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

const findEventBoundary = (buffer: string) => {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) {
    return null;
  }
  return { index: match.index, length: match[0].length };
};

const parseEventBlock = (block: string): AgentSSEEvent | null => {
  const lines = block.split(/\r?\n/);
  let data = "";
  for (const line of lines) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trimStart();
    }
  }

  if (!data) return null;

  try {
    return JSON.parse(data) as AgentSSEEvent;
  } catch {
    return null;
  }
};

export function useAgentStream() {
  const abortRef = useRef<AbortController | null>(null);
  const sawTerminalEventRef = useRef(false);
  const [events, setEvents] = useState<AgentSSEEvent[]>([]);
  const [liveMessage, setLiveMessage] = useState("");
  const [completedMessage, setCompletedMessage] = useState<AgentMessage | null>(null);
  const [liveCitations, setLiveCitations] = useState<Citation[]>([]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">("idle");

  const reset = useCallback(() => {
    sawTerminalEventRef.current = false;
    setEvents([]);
    setLiveMessage("");
    setCompletedMessage(null);
    setLiveCitations([]);
    setRun(null);
    setError(null);
    setStatus("idle");
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sawTerminalEventRef.current = false;
    setEvents([]);
    setLiveMessage("");
    setCompletedMessage(null);
    setLiveCitations([]);
    setRun(null);
    setError(null);
    setStatus("idle");
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleEvent = useCallback((event: AgentSSEEvent) => {
    setEvents((current) => [...current, event]);

    if (event.type === "run.started") {
      const candidate = event.data.run;
      if (candidate && typeof candidate === "object") {
        setRun(candidate as AgentRun);
      }
      setStatus("running");
      return;
    }

    if (event.type === "message.delta") {
      const delta = event.data.delta;
      if (typeof delta === "string") {
        setLiveMessage((current) => current + delta);
      }
      return;
    }

    if (event.type === "citation.added") {
      const candidate = event.data.citation;
      if (candidate && typeof candidate === "object") {
        setLiveCitations((current) => dedupeCitations([...current, candidate as Citation]));
      }
      return;
    }

    if (event.type === "message.completed") {
      const candidate = event.data.message;
      if (candidate && typeof candidate === "object") {
        const message = candidate as AgentMessage;
        setCompletedMessage(message);
        setLiveMessage(message.content);
      }
      const candidates = event.data.citations;
      if (Array.isArray(candidates)) {
        setLiveCitations(dedupeCitations(candidates as Citation[]));
      }
      return;
    }

    if (event.type === "run.completed") {
      sawTerminalEventRef.current = true;
      const candidate = event.data.run;
      if (candidate && typeof candidate === "object") {
        setRun(candidate as AgentRun);
      }
      setStatus("completed");
      return;
    }

    if (event.type === "run.error") {
      sawTerminalEventRef.current = true;
      const detail = event.data.error;
      setError(typeof detail === "string" ? detail : "Run failed");
      const candidate = event.data.run;
      if (candidate && typeof candidate === "object") {
        setRun(candidate as AgentRun);
      }
      setStatus("error");
    }
  }, []);

  const startRun = useCallback(async ({ threadId, body }: StartRunInput) => {
    const controller = new AbortController();
    abortRef.current = controller;
    sawTerminalEventRef.current = false;
    setEvents([]);
    setLiveMessage("");
    setCompletedMessage(null);
    setLiveCitations([]);
    setRun(null);
    setError(null);
    setStatus("running");

    try {
      const response = await agentApi.streamRun(threadId, body, controller.signal);
      if (!response.body) {
        throw new Error("Streaming response body missing");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = findEventBoundary(buffer);
        while (boundary) {
          const block = buffer.slice(0, boundary.index).trim();
          buffer = buffer.slice(boundary.index + boundary.length);
          const parsed = parseEventBlock(block);
          if (parsed) {
            handleEvent(parsed);
          }
          boundary = findEventBoundary(buffer);
        }
      }

      const finalBlock = buffer.trim();
      if (finalBlock) {
        const parsed = parseEventBlock(finalBlock);
        if (parsed) {
          handleEvent(parsed);
        }
      }

      if (!sawTerminalEventRef.current) {
        throw new Error("Stream ended before AGOS emitted a terminal event");
      }

      setStatus((current) => (current === "running" ? "completed" : current));
    } catch (streamError) {
      if (controller.signal.aborted) {
        return;
      }

      const detail = streamError instanceof Error ? streamError.message : "Run failed";
      setError(detail);
      setStatus("error");
      throw streamError;
    } finally {
      abortRef.current = null;
    }
  }, [handleEvent]);

  return {
    cancel,
    completedMessage,
    error,
    events,
    isStreaming: status === "running",
    liveCitations,
    liveMessage,
    reset,
    run,
    startRun,
    status,
  };
}

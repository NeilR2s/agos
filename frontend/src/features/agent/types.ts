export type AgentMode = "general" | "research" | "trading";
export type AgentRole = "user" | "assistant" | "system";

export interface Citation {
  label: string;
  source: string;
  kind: string;
  href?: string | null;
  excerpt?: string | null;
  meta: Record<string, unknown>;
}

export interface AgentThread {
  id: string;
  userId: string;
  title: string;
  mode: AgentMode;
  selectedTicker?: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunStatus?: string | null;
  lastAssistantPreview?: string | null;
  kind: string;
}

export interface AgentMessage {
  id: string;
  threadId: string;
  runId?: string | null;
  role: AgentRole;
  content: string;
  citations: Citation[];
  createdAt: string;
  tokenCount?: number | null;
  kind: string;
}

export interface AgentRun {
  id: string;
  threadId: string;
  userId: string;
  model: string;
  mode: AgentMode;
  selectedTicker?: string | null;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  latencyMs?: number | null;
  ttftMs?: number | null;
  usage: Record<string, unknown>;
  error?: string | null;
  summary?: string | null;
  kind: string;
}

export interface AgentEvent {
  id: string;
  threadId: string;
  runId: string;
  sequence: number;
  type: string;
  source: string;
  data: Record<string, unknown>;
  createdAt: string;
  kind: string;
}

export interface AgentSSEEvent {
  threadId: string;
  runId: string;
  timestamp: string;
  sequence: number;
  type: string;
  data: Record<string, unknown>;
}

export interface AgentThreadCreateRequest {
  title?: string;
  mode?: AgentMode;
  selectedTicker?: string;
}

export interface AgentRunRequest {
  message: string;
  mode?: AgentMode;
  selectedTicker?: string;
  lookbackDays?: number;
  uiContext?: Record<string, unknown>;
}

export interface AgentRunResult {
  thread: AgentThread;
  run: AgentRun;
  assistantMessage?: AgentMessage | null;
  events: AgentEvent[];
}

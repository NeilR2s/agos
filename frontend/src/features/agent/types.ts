export type AgentMode = "general" | "research" | "trading";
export type AgentRole = "user" | "assistant" | "system";
export type AgentModelPreset = "agos-swift" | "agos-core" | "agos-deep";
export type AgentThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface AgentExternalCapability {
  id: string;
  label: string;
  kind: "remote_mcp" | "custom_tool" | "skill";
  enabled: boolean;
  status: "planned" | "configured";
  endpoint?: string | null;
  description?: string | null;
}

export interface AgentToolSettings {
  portfolio: boolean;
  market: boolean;
  research: boolean;
  engine: boolean;
  webSearch: boolean;
  codeExecution: boolean;
  urlContext: boolean;
}

export interface AgentRunConfig {
  modelPreset: AgentModelPreset;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  thinkingLevel: AgentThinkingLevel;
  maxAgents: number;
  tools: AgentToolSettings;
  skills: string[];
  externalCapabilities: AgentExternalCapability[];
}

export interface Citation {
  label: string;
  source: string;
  kind: string;
  href?: string | null;
  excerpt?: string | null;
  meta: Record<string, unknown>;
}

export interface AgentSourceReference {
  id: string;
  label: string;
  source: string;
  kind: string;
  href?: string | null;
  excerpt?: string | null;
  publishedAt?: string | null;
  retrievedAt?: string | null;
  freshness: "current" | "recent" | "moderate" | "stale" | "unknown";
  agentId?: string | null;
  agentLabel?: string | null;
  meta: Record<string, unknown>;
}

export interface AgentEvidenceItem {
  id: string;
  claim: string;
  detail: string;
  confidence: "low" | "medium" | "high";
  sourceIds: string[];
  agentIds: string[];
  calculation?: string | null;
}

export interface AgentRecommendation {
  id: string;
  title: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  risk: string;
  nextAction: string;
  evidenceIds: string[];
  sourceIds: string[];
  executionReady: boolean;
  supportStatus?: "supported" | "partial" | "unsupported";
  supportReason?: string | null;
}

export interface AgentDecisionRow {
  holding: string;
  status: string;
  finding: string;
  suggestedAction: string;
  confidence: "low" | "medium" | "high";
  sourceIds: string[];
}

export interface AgentStructuredOutput {
  summary: string;
  assumptions: string[];
  risks: string[];
  nextSteps: string[];
  reliabilityWarnings?: string[];
  evidence: AgentEvidenceItem[];
  recommendations: AgentRecommendation[];
  decisionTable: AgentDecisionRow[];
  sources: AgentSourceReference[];
  executionReady: boolean;
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
  agentId?: string | null;
  role: AgentRole;
  content: string;
  citations: Citation[];
  createdAt: string;
  tokenCount?: number | null;
  structuredOutput?: AgentStructuredOutput | null;
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
  config: Record<string, unknown>;
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
  agentId?: string | null;
  agentLabel?: string | null;
  agentRole?: string | null;
  parentAgentId?: string | null;
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
  agentId?: string | null;
  agentLabel?: string | null;
  agentRole?: string | null;
  parentAgentId?: string | null;
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
  config: AgentRunConfig;
  uiContext?: Record<string, unknown>;
}

export interface AgentRunResult {
  thread: AgentThread;
  run: AgentRun;
  assistantMessage?: AgentMessage | null;
  events: AgentEvent[];
}

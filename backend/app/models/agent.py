from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


AgentMode = Literal["general", "research", "trading"]
AgentRole = Literal["user", "assistant", "system"]
AgentRunStatus = Literal["queued", "running", "completed", "error", "cancelled"]
AgentModelPreset = Literal["agos-swift", "agos-core", "agos-deep"]
AgentThinkingLevel = Literal["minimal", "low", "medium", "high"]


class AgentExternalCapability(BaseModel):
    id: str
    label: str
    kind: Literal["remote_mcp", "custom_tool", "skill"]
    enabled: bool = True
    status: Literal["planned", "configured"] = "planned"
    endpoint: Optional[str] = None
    description: Optional[str] = None


class AgentToolSettings(BaseModel):
    portfolio: bool = True
    market: bool = True
    research: bool = True
    engine: bool = True
    webSearch: bool = True
    codeExecution: bool = False
    urlContext: bool = True


class AgentRunConfig(BaseModel):
    modelPreset: AgentModelPreset = "agos-core"
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    topP: float = Field(default=0.95, ge=0.0, le=1.0)
    maxOutputTokens: int = Field(default=2048, ge=256, le=8192)
    thinkingLevel: AgentThinkingLevel = "medium"
    maxAgents: int = Field(default=3, ge=1, le=4)
    tools: AgentToolSettings = Field(default_factory=AgentToolSettings)
    skills: list[str] = Field(default_factory=list)
    externalCapabilities: list[AgentExternalCapability] = Field(default_factory=list)


class Citation(BaseModel):
    label: str
    source: str
    kind: str = "reference"
    href: Optional[str] = None
    excerpt: Optional[str] = None
    meta: dict[str, Any] = Field(default_factory=dict)


class AgentThreadCreate(BaseModel):
    title: Optional[str] = None
    mode: AgentMode = "general"
    selectedTicker: Optional[str] = None


class AgentThread(BaseModel):
    id: str
    userId: str
    title: str
    mode: AgentMode = "general"
    selectedTicker: Optional[str] = None
    createdAt: str
    updatedAt: str
    lastRunStatus: Optional[str] = None
    lastAssistantPreview: Optional[str] = None
    kind: str = "thread"


class AgentMessage(BaseModel):
    id: str
    threadId: str
    runId: Optional[str] = None
    agentId: Optional[str] = None
    role: AgentRole
    content: str
    citations: list[Citation] = Field(default_factory=list)
    createdAt: str
    tokenCount: Optional[int] = None
    kind: str = "message"


class AgentRunRequest(BaseModel):
    message: str = Field(..., min_length=1)
    mode: Optional[AgentMode] = None
    selectedTicker: Optional[str] = None
    lookbackDays: int = Field(default=30, ge=14, le=365)
    config: AgentRunConfig = Field(default_factory=AgentRunConfig)
    uiContext: dict[str, Any] = Field(default_factory=dict)


class AgentRun(BaseModel):
    id: str
    threadId: str
    userId: str
    model: str
    mode: AgentMode = "general"
    selectedTicker: Optional[str] = None
    status: AgentRunStatus
    startedAt: str
    completedAt: Optional[str] = None
    latencyMs: Optional[float] = None
    ttftMs: Optional[float] = None
    usage: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    summary: Optional[str] = None
    kind: str = "run"


class AgentEvent(BaseModel):
    id: str
    threadId: str
    runId: str
    sequence: int
    type: str
    source: str
    agentId: Optional[str] = None
    agentLabel: Optional[str] = None
    agentRole: Optional[str] = None
    parentAgentId: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)
    createdAt: str
    kind: str = "event"


class AgentSSEEvent(BaseModel):
    threadId: str
    runId: str
    timestamp: str
    sequence: int
    type: str
    agentId: Optional[str] = None
    agentLabel: Optional[str] = None
    agentRole: Optional[str] = None
    parentAgentId: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)


class AgentRunResult(BaseModel):
    thread: AgentThread
    run: AgentRun
    assistantMessage: Optional[AgentMessage] = None
    events: list[AgentEvent] = Field(default_factory=list)


class AgentInterruptDecisionRequest(BaseModel):
    note: Optional[str] = None
    updatedInput: Optional[str] = None

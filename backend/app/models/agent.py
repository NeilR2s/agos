from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


AgentMode = Literal["general", "research", "trading"]
AgentRole = Literal["user", "assistant", "system"]
AgentRunStatus = Literal["queued", "running", "completed", "error", "cancelled"]


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
    data: dict[str, Any] = Field(default_factory=dict)
    createdAt: str
    kind: str = "event"


class AgentSSEEvent(BaseModel):
    threadId: str
    runId: str
    timestamp: str
    sequence: int
    type: str
    data: dict[str, Any] = Field(default_factory=dict)


class AgentRunResult(BaseModel):
    thread: AgentThread
    run: AgentRun
    assistantMessage: Optional[AgentMessage] = None
    events: list[AgentEvent] = Field(default_factory=list)


class AgentInterruptDecisionRequest(BaseModel):
    note: Optional[str] = None
    updatedInput: Optional[str] = None

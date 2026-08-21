from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.models.agent import Citation


RuntimeEvent = dict[str, Any]
EmitFn = Callable[[RuntimeEvent], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class WorkerSpec:
    agent_id: str
    label: str
    role: str
    instruction: str
    tool_role: str


@dataclass(slots=True)
class WorkerResult:
    agent_id: str
    label: str
    role: str
    summary: str
    content: str
    citations: list[Citation]
    tool_count: int
    status: str = "completed"

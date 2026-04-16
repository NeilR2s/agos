from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.models.agent import Citation


@dataclass(slots=True)
class AgentRuntimeContext:
    mode: str
    selected_ticker: Optional[str]
    correlation_id: str
    lookback_days: int = 30
    ui_context: dict[str, Any] = field(default_factory=dict)
    feature_flags: dict[str, bool] = field(default_factory=dict)


@dataclass(slots=True)
class ToolOutcome:
    name: str
    summary: str
    payload: Any
    citations: list[Citation] = field(default_factory=list)
    risk_flags: list[str] = field(default_factory=list)

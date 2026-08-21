from __future__ import annotations

import json
import re
from typing import Iterable

from app.models.agent import AgentMessage
from app.services.agent.prompts import build_system_prompt as build_agent_system_prompt
from app.services.agent.state import AgentRuntimeContext, ToolOutcome


def sanitize_preview(text: str, limit: int = 160) -> str:
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def derive_thread_title(message: str, selected_ticker: str | None = None) -> str:
    preview = sanitize_preview(message, limit=48)
    if selected_ticker:
        return f"{selected_ticker.upper()} / {preview}" if preview else selected_ticker.upper()
    return preview or "New AGOS Session"


def trim_conversation(messages: Iterable[AgentMessage], window: int) -> list[AgentMessage]:
    history = list(messages)
    if len(history) <= window:
        return history
    return history[-window:]


def should_call_engine(message: str, mode: str) -> bool:
    if mode == "trading":
        return True
    lowered = message.lower()
    keywords = ["trade", "buy", "sell", "position", "risk", "entry", "exit", "decision"]
    return any(keyword in lowered for keyword in keywords)


def should_call_financials(message: str) -> bool:
    lowered = message.lower()
    keywords = ["financial", "balance", "income", "quarter", "report", "statement", "earnings"]
    return any(keyword in lowered for keyword in keywords)


def build_system_prompt(context: AgentRuntimeContext) -> str:
    return build_agent_system_prompt(context)


def render_tool_context(outcomes: list[ToolOutcome]) -> str:
    sections: list[str] = []
    for outcome in outcomes:
        payload = json.dumps(outcome.payload, ensure_ascii=True, default=str, indent=2)
        sections.append(f"[{outcome.name}] {outcome.summary}\n{payload}")
    return "\n\n".join(sections)

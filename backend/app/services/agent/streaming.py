from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

from app.models.agent import AgentEvent, AgentSSEEvent


NON_PERSISTED_EVENT_TYPES = frozenset({"heartbeat", "message.delta"})


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_sse_event(
    *,
    thread_id: str,
    run_id: str,
    sequence: int,
    event_type: str,
    data: dict,
    agent_id: str | None = None,
    agent_label: str | None = None,
    agent_role: str | None = None,
    parent_agent_id: str | None = None,
) -> AgentSSEEvent:
    return AgentSSEEvent(
        threadId=thread_id,
        runId=run_id,
        timestamp=utc_now_iso(),
        sequence=sequence,
        type=event_type,
        agentId=agent_id,
        agentLabel=agent_label,
        agentRole=agent_role,
        parentAgentId=parent_agent_id,
        data=data,
    )


def persistable_event(event: AgentSSEEvent, source: str = "agent") -> AgentEvent:
    return AgentEvent(
        id=str(uuid4()),
        threadId=event.threadId,
        runId=event.runId,
        sequence=event.sequence,
        type=event.type,
        source=source,
        agentId=event.agentId,
        agentLabel=event.agentLabel,
        agentRole=event.agentRole,
        parentAgentId=event.parentAgentId,
        data=event.data,
        createdAt=event.timestamp,
    )


def should_persist_event(event_type: str) -> bool:
    return event_type not in NON_PERSISTED_EVENT_TYPES


def encode_sse(event: AgentSSEEvent) -> str:
    payload = json.dumps(event.model_dump(mode="json"), ensure_ascii=True)
    return f"event: {event.type}\ndata: {payload}\n\n"

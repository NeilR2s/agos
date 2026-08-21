from __future__ import annotations

import re
from typing import AsyncIterator

from langchain_core.messages import HumanMessage

from app.models.agent import AgentMessage, AgentRunConfig
from app.services.agent.middleware import render_tool_context
from app.services.agent.configuration import resolve_model_profile
from app.services.agent.llm import build_chat_model, is_model_configured
from app.services.agent.prompts import DETERMINISTIC_FALLBACK_ASSESSMENT, build_responder_prompt
from app.services.agent.state import AgentRuntimeContext, ToolOutcome


def _history_block(history: list[AgentMessage]) -> str:
    if not history:
        return "No prior conversation."
    return "\n".join(f"{message.role.upper()}: {message.content}" for message in history)


def _stringify_chunk_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


class BaseAgentResponder:
    model_name = "agos-deterministic"
    reason: str | None = None

    async def stream_response(
        self,
        *,
        system_prompt: str,
        latest_user_message: str,
        history: list[AgentMessage],
        tool_outcomes: list[ToolOutcome],
        context: AgentRuntimeContext,
    ) -> AsyncIterator[str]:
        raise NotImplementedError


class FallbackAgentResponder(BaseAgentResponder):
    reason = "DeepSeek is not configured. Using deterministic response synthesis."

    async def stream_response(
        self,
        *,
        system_prompt: str,
        latest_user_message: str,
        history: list[AgentMessage],
        tool_outcomes: list[ToolOutcome],
        context: AgentRuntimeContext,
    ) -> AsyncIterator[str]:
        del system_prompt, history
        lines = [
            f"AGOS mode: {context.mode.upper()}.",
            f"Request: {latest_user_message.strip()}",
        ]
        if context.selected_ticker:
            lines.append(f"Ticker focus: {context.selected_ticker.upper()}.")

        if tool_outcomes:
            lines.append("")
            lines.append("Evidence summary:")
            for outcome in tool_outcomes:
                lines.append(f"- {outcome.summary}")
                if outcome.risk_flags:
                    lines.append(f"- Risk flags: {', '.join(outcome.risk_flags)}")
        else:
            lines.append("")
            lines.append("No structured tool evidence was required for this answer.")

        lines.append("")
        lines.append("Assessment:")
        lines.append(DETERMINISTIC_FALLBACK_ASSESSMENT)

        response = "\n".join(lines)
        chunks = [chunk for chunk in re.split(r"(\s+)", response) if chunk]
        for chunk in chunks:
            yield chunk


class DeepSeekResponder(BaseAgentResponder):
    def __init__(self):
        context_config = AgentRunConfig()
        self.model_profile = resolve_model_profile(context_config)
        self.model_name = self.model_profile.model
        self.model = build_chat_model(self.model_profile, context_config)

    async def stream_response(
        self,
        *,
        system_prompt: str,
        latest_user_message: str,
        history: list[AgentMessage],
        tool_outcomes: list[ToolOutcome],
        context: AgentRuntimeContext,
    ) -> AsyncIterator[str]:
        prompt = build_responder_prompt(
            system_prompt=system_prompt,
            latest_user_message=latest_user_message,
            history=history,
            tool_outcomes=tool_outcomes,
            context=context,
            history_block=_history_block(history),
            tool_context=render_tool_context(tool_outcomes),
        )
        messages = [HumanMessage(content=prompt)]

        async for chunk in self.model.astream(messages):
            text = _stringify_chunk_content(getattr(chunk, "content", ""))
            if text:
                yield text


def build_agent_responder() -> BaseAgentResponder:
    if not is_model_configured():
        return FallbackAgentResponder()

    try:
        return DeepSeekResponder()
    except Exception:
        return FallbackAgentResponder()

from __future__ import annotations

import re
from typing import AsyncIterator

from app.core.config import settings
from app.models.agent import AgentMessage
from app.services.agent.middleware import render_tool_context
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
    reason = "Gemini is not configured. Using deterministic response synthesis."

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
        lines.append(
            "Use the evidence summary as the current operating picture. If you need a deeper answer, configure Gemini so AGOS can synthesize these tool results into a richer narrative."
        )

        response = "\n".join(lines)
        chunks = [chunk for chunk in re.split(r"(\s+)", response) if chunk]
        for chunk in chunks:
            yield chunk


class GeminiResponder(BaseAgentResponder):
    def __init__(self):
        from langchain_google_genai import ChatGoogleGenerativeAI

        self.model_name = settings.AGENT_MODEL
        self.model = ChatGoogleGenerativeAI(
            model=settings.AGENT_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=1,
            thinking_level="high"
        )

    async def stream_response(
        self,
        *,
        system_prompt: str,
        latest_user_message: str,
        history: list[AgentMessage],
        tool_outcomes: list[ToolOutcome],
        context: AgentRuntimeContext,
    ) -> AsyncIterator[str]:
        from langchain_core.messages import HumanMessage

        prompt = (
            f"System instructions:\n{system_prompt}\n\n"
            f"Conversation history:\n{_history_block(history)}\n\n"
            f"Latest operator request:\n{latest_user_message.strip()}\n\n"
            f"Selected ticker: {context.selected_ticker or 'none'}\n"
            f"Mode: {context.mode}\n\n"
            f"Structured tool context:\n{render_tool_context(tool_outcomes)}\n\n"
            "Respond with short sections for Overview, Evidence, Inference, and Next Step."
        )
        messages = [HumanMessage(content=prompt)]

        async for chunk in self.model.astream(messages):
            text = _stringify_chunk_content(getattr(chunk, "content", ""))
            if text:
                yield text


def build_agent_responder() -> BaseAgentResponder:
    if not settings.GEMINI_API_KEY:
        return FallbackAgentResponder()

    try:
        return GeminiResponder()
    except Exception:
        return FallbackAgentResponder()

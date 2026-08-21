from __future__ import annotations

from typing import Any

try:
    from langchain_openai import ChatOpenAI
except ImportError:  # pragma: no cover - dependency is declared in requirements.txt
    ChatOpenAI = None  # type: ignore[assignment]

from app.core.config import settings
from app.models.agent import AgentRunConfig
from app.services.agent.configuration import AgentModelProfile


def is_model_configured() -> bool:
    return bool(settings.DEEPSEEK_API_KEY)


def build_chat_model(profile: AgentModelProfile, run_config: AgentRunConfig):
    if ChatOpenAI is None:
        raise RuntimeError("langchain-openai is not installed. Run pip install -r requirements.txt from backend/.")
    if not settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    kwargs: dict[str, Any] = {
        "model": profile.model,
        "api_key": settings.DEEPSEEK_API_KEY,
        "base_url": settings.DEEPSEEK_BASE_URL,
        "temperature": run_config.temperature,
        "top_p": run_config.topP,
        "max_tokens": run_config.maxOutputTokens,
        "max_retries": 2,
        "model_kwargs": {"reasoning_effort": profile.reasoning_effort},
    }
    return ChatOpenAI(**kwargs)

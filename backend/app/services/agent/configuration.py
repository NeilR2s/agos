from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings
from app.models.agent import AgentModelPreset, AgentRunConfig


@dataclass(frozen=True, slots=True)
class AgentModelProfile:
    preset: AgentModelPreset
    label: str
    model: str
    description: str


MODEL_PROFILES: dict[AgentModelPreset, AgentModelProfile] = {
    "agos-swift": AgentModelProfile(
        preset="agos-swift",
        label="AGOS Swift",
        model="gemini-3.1-flash-lite-preview",
        description="Fastest AGOS model for low-latency routing, search, and lightweight analysis.",
    ),
    "agos-core": AgentModelProfile(
        preset="agos-core",
        label="AGOS Core",
        model="gemini-3-flash-preview",
        description="Balanced AGOS model for most operator chat, research, and synthesis runs.",
    ),
    "agos-deep": AgentModelProfile(
        preset="agos-deep",
        label="AGOS Deep",
        model="gemini-3.1-pro-preview",
        description="Highest-depth AGOS model for multi-agent synthesis and heavy reasoning.",
    ),
}


def resolve_model_profile(config: AgentRunConfig) -> AgentModelProfile:
    if settings.AGENT_MODEL:
        return AgentModelProfile(
            preset=config.modelPreset,
            label=MODEL_PROFILES[config.modelPreset].label,
            model=settings.AGENT_MODEL,
            description=MODEL_PROFILES[config.modelPreset].description,
        )
    return MODEL_PROFILES[config.modelPreset]


def config_to_public_dict(config: AgentRunConfig) -> dict:
    profile = resolve_model_profile(config)
    payload = config.model_dump(mode="json")
    payload.update(
        {
            "model": profile.model,
            "modelLabel": profile.label,
            "modelDescription": profile.description,
        }
    )
    return payload

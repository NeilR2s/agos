from __future__ import annotations

from dataclasses import dataclass

from app.models.agent import (
    AgentConfigManifest,
    AgentModelPreset,
    AgentModelProfileManifest,
    AgentRunConfig,
)
from app.services.agent.skills import list_skill_manifest


DEEPSEEK_PROVIDER = "deepseek"
DEEPSEEK_MODEL = "deepseek-v4-flash"


@dataclass(frozen=True, slots=True)
class AgentModelProfile:
    preset: AgentModelPreset
    label: str
    model: str
    provider: str
    reasoning_effort: str
    subtitle: str
    description: str


MODEL_PROFILES: dict[AgentModelPreset, AgentModelProfile] = {
    "agos-swift": AgentModelProfile(
        preset="agos-swift",
        label="AGOS Swift",
        model=DEEPSEEK_MODEL,
        provider=DEEPSEEK_PROVIDER,
        reasoning_effort="low",
        subtitle="DeepSeek Flash with low reasoning effort",
        description="Low-effort DeepSeek profile for fast routing, light analysis, and quick operator turns.",
    ),
    "agos-core": AgentModelProfile(
        preset="agos-core",
        label="AGOS Core",
        model=DEEPSEEK_MODEL,
        provider=DEEPSEEK_PROVIDER,
        reasoning_effort="high",
        subtitle="DeepSeek Flash with high reasoning effort",
        description="High-effort DeepSeek profile for default research, synthesis, and portfolio analysis.",
    ),
    "agos-deep": AgentModelProfile(
        preset="agos-deep",
        label="AGOS Deep",
        model=DEEPSEEK_MODEL,
        provider=DEEPSEEK_PROVIDER,
        reasoning_effort="max",
        subtitle="DeepSeek Flash with max reasoning effort",
        description="Max-effort DeepSeek profile for deep multi-agent synthesis and risk-heavy work.",
    ),
}


def resolve_model_profile(config: AgentRunConfig) -> AgentModelProfile:
    return MODEL_PROFILES[config.modelPreset]


def list_model_profiles() -> list[AgentModelProfileManifest]:
    return [
        AgentModelProfileManifest(
            id=profile.preset,
            label=profile.label,
            subtitle=profile.subtitle,
            provider=profile.provider,
            model=profile.model,
            reasoningEffort=profile.reasoning_effort,
            description=profile.description,
        )
        for profile in MODEL_PROFILES.values()
    ]


def build_agent_config_manifest() -> AgentConfigManifest:
    return AgentConfigManifest(
        modelProfiles=list_model_profiles(),
        skillOptions=list_skill_manifest(),
        defaultConfig=AgentRunConfig(),
    )


def config_to_public_dict(config: AgentRunConfig) -> dict:
    profile = resolve_model_profile(config)
    payload = config.model_dump(mode="json")
    payload.update(
        {
            "model": profile.model,
            "modelLabel": profile.label,
            "modelDescription": profile.description,
            "modelProvider": profile.provider,
            "reasoningEffort": profile.reasoning_effort,
            "thinkingLevel": profile.reasoning_effort,
        }
    )
    return payload

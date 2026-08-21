from __future__ import annotations

from dataclasses import dataclass

from app.models.agent import AgentSkillManifest


@dataclass(frozen=True, slots=True)
class AgentSkillDefinition:
    id: str
    label: str
    prompt: str


SKILL_LIBRARY: tuple[AgentSkillDefinition, ...] = (
    AgentSkillDefinition(
        id="research-rigor",
        label="Research Rigor",
        prompt=(
            "Prioritize source quality, timeline accuracy, and explicit evidence separation. "
            "When sources conflict, name the conflict and state what would resolve it."
        ),
    ),
    AgentSkillDefinition(
        id="portfolio-context",
        label="Portfolio Context",
        prompt=(
            "Anchor recommendations to the operator's actual exposure when portfolio data is available. "
            "Call out concentration, sizing, overlap, liquidity, and missing-position context. "
            "State assumptions about risk tolerance, time horizon, and tax constraints."
        ),
    ),
    AgentSkillDefinition(
        id="trade-guardrails",
        label="Trade Guardrails",
        prompt=(
            "Treat trade decisions as gated outputs. Distinguish setup quality, invalidation, execution risk, and sizing risk. "
            "Frame advice as non-execution-ready unless final confirmation and engine approval are both present. "
            "If the engine disagrees with the thesis, surface that conflict clearly."
        ),
    ),
    AgentSkillDefinition(
        id="web-investigator",
        label="Web Investigator",
        prompt=(
            "Use external context only to fill factual gaps or verify freshness. "
            "Summarize source-backed findings in plain language and do not overstate freshness."
        ),
    ),
    AgentSkillDefinition(
        id="quant-scratchpad",
        label="Quant Scratchpad",
        prompt=(
            "Use computation only when it materially improves precision or auditability. "
            "Report the result in operator-facing language and include assumptions behind the calculation."
        ),
    ),
)


SKILLS_BY_ID = {skill.id: skill for skill in SKILL_LIBRARY}


def list_skill_manifest() -> list[AgentSkillManifest]:
    return [AgentSkillManifest(id=skill.id, label=skill.label, prompt=skill.prompt) for skill in SKILL_LIBRARY]


def resolve_skill_prompts(skill_ids: list[str]) -> list[str]:
    prompts: list[str] = []
    seen: set[str] = set()
    for skill_id in skill_ids:
        normalized = skill_id.strip().lower()
        if not normalized or normalized in seen:
            continue
        skill = SKILLS_BY_ID.get(normalized)
        if skill:
            prompts.append(skill.prompt)
            seen.add(normalized)
    return prompts

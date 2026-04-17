from __future__ import annotations

SKILL_LIBRARY: dict[str, str] = {
    "research-rigor": (
        "Prioritize source quality, timeline accuracy, and explicit evidence separation. "
        "When data conflicts, identify the conflict instead of smoothing it over."
    ),
    "portfolio-context": (
        "Anchor recommendations to the operator's actual exposure when portfolio data is available. "
        "Call out concentration, sizing, and overlap risks."
    ),
    "trade-guardrails": (
        "Treat trade decisions as gated outputs. Distinguish setup quality, invalidation, and execution risk. "
        "If the engine disagrees, surface that conflict clearly."
    ),
    "web-investigator": (
        "Use web and URL context selectively to fill factual gaps, then summarize findings in plain language. "
        "Do not overstate freshness when only historical context is available."
    ),
    "quant-scratchpad": (
        "Use code execution only when it materially improves precision or auditability. "
        "Explain the result in operator-facing language after computation."
    ),
}


def resolve_skill_prompts(skill_ids: list[str]) -> list[str]:
    prompts: list[str] = []
    seen: set[str] = set()
    for skill_id in skill_ids:
        normalized = skill_id.strip().lower()
        if not normalized or normalized in seen:
            continue
        if normalized in SKILL_LIBRARY:
            prompts.append(SKILL_LIBRARY[normalized])
            seen.add(normalized)
    return prompts

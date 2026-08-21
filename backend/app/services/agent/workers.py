from __future__ import annotations

from app.models.agent import AgentRunConfig
from app.services.agent.state import AgentRuntimeContext
from app.services.agent.types import WorkerSpec


def role_instructions(mode: str, selected_ticker: str | None) -> list[WorkerSpec]:
    ticker_line = selected_ticker or "the active operating context"
    shared = [
        WorkerSpec(
            agent_id="research-lead",
            label="Research Lead",
            role="research-lead",
            tool_role="research-lead",
            instruction=(
                f"Own the primary evidence sweep for {ticker_line}. Resolve what matters, what changed, and what still needs verification. "
                "Use first-party tools first, then external retrieval only when necessary."
            ),
        ),
        WorkerSpec(
            agent_id="portfolio-analyst",
            label="Portfolio Analyst",
            role="portfolio-analyst",
            tool_role="portfolio-analyst",
            instruction=(
                "Anchor the answer to the operator's current exposure, overlap, concentration, and position context. "
                "Call out what the portfolio already owns or lacks."
            ),
        ),
        WorkerSpec(
            agent_id="web-investigator",
            label="Web Investigator",
            role="web-investigator",
            tool_role="web-investigator",
            instruction=(
                "Use retrieval tools to validate freshness, external references, and URL-specific claims. "
                "Report only observable facts and source-backed findings."
            ),
        ),
        WorkerSpec(
            agent_id="risk-sentinel",
            label="Risk Sentinel",
            role="risk-sentinel",
            tool_role="risk-sentinel",
            instruction=(
                "Stress-test the thesis, surface hidden risk, and quantify edge cases when computation materially improves the answer. "
                "Do not produce a trade directive without explicit evidence."
            ),
        ),
    ]

    if mode == "trading":
        shared.append(
            WorkerSpec(
                agent_id="execution-guard",
                label="Execution Guard",
                role="execution-guard",
                tool_role="execution-guard",
                instruction=(
                    "Translate validated evidence into an execution-minded read. Use the engine when available, quantify risk, and keep the output decision-aware."
                ),
            )
        )
    return shared


def build_worker_specs(mode: str, context: AgentRuntimeContext, run_config: AgentRunConfig) -> list[WorkerSpec]:
    ordered = role_instructions(mode, context.selected_ticker)
    specs: list[WorkerSpec] = []
    for candidate in ordered:
        if len(specs) >= run_config.maxAgents:
            break
        if candidate.role == "portfolio-analyst" and not run_config.tools.portfolio:
            continue
        if candidate.role == "web-investigator" and not (run_config.tools.research or run_config.tools.webSearch or run_config.tools.urlContext):
            continue
        if candidate.role == "risk-sentinel" and not (run_config.tools.market or run_config.tools.engine or run_config.tools.codeExecution):
            continue
        if candidate.role == "execution-guard" and not (mode == "trading" and run_config.tools.engine):
            continue
        specs.append(candidate)
    if not specs:
        specs.append(ordered[0])
    return specs

from __future__ import annotations

from typing import Iterable, Optional

from langchain_core.runnables.config import RunnableConfig
from langchain_core.tools import BaseTool, tool

from app.db.agent_cosmos import get_agent_repository
from app.models.agent import AgentExternalCapability, AgentToolSettings
from app.services.agent.state import AgentRuntimeContext, ToolOutcome
from app.services.agent.tools.engine import EngineAgentTools
from app.services.agent.tools.market import MarketAgentTools
from app.services.agent.tools.portfolio import PortfolioAgentTools
from app.services.agent.tools.research import ResearchAgentTools


def serialize_outcome(outcome: ToolOutcome) -> dict:
    return {
        "name": outcome.name,
        "summary": outcome.summary,
        "payload": outcome.payload,
        "citations": [c.model_dump() for c in outcome.citations],
        "risk_flags": outcome.risk_flags,
    }


def get_runtime(config: RunnableConfig) -> dict:
    runtime = config.get("configurable", {}).get("runtime")
    if not isinstance(runtime, dict):
        raise RuntimeError("Agent runtime config missing")
    return runtime


portfolio_tools = PortfolioAgentTools()
market_tools = MarketAgentTools()
engine_tools = EngineAgentTools()


@tool
async def get_portfolio_snapshot(config: RunnableConfig) -> dict:
    """Load a snapshot of the operator's current portfolio holdings and total value."""
    runtime = get_runtime(config)
    outcome = await portfolio_tools.get_portfolio_snapshot(str(runtime["user_id"]))
    return serialize_outcome(outcome)


@tool
async def get_portfolio_holding(ticker: str, config: RunnableConfig) -> dict:
    """Check the operator's current portfolio exposure to a specific ticker."""
    runtime = get_runtime(config)
    outcome = await portfolio_tools.get_portfolio_holding(str(runtime["user_id"]), ticker)
    return serialize_outcome(outcome)


@tool
async def get_market_overview(ticker: str) -> dict:
    """Get live market overview and details for a specific ticker from the PSE."""
    outcome = await market_tools.get_market_overview(ticker)
    return serialize_outcome(outcome)


@tool
async def get_financial_data(ticker: str) -> dict:
    """Load raw financial disclosures and statements for a specific ticker."""
    outcome = await market_tools.get_financial_data(ticker)
    return serialize_outcome(outcome)


@tool
async def get_financial_reports(ticker: str) -> dict:
    """Load parsed financial reports and metrics for a specific ticker."""
    outcome = await market_tools.get_financial_reports(ticker)
    return serialize_outcome(outcome)


@tool
async def get_latest_news(ticker: str, limit: int = 5) -> dict:
    """Load recent news sentiment and articles for a specific ticker."""
    repository = get_agent_repository()
    research_tools = ResearchAgentTools(repository)
    outcome = await research_tools.get_latest_news(ticker, limit)
    return serialize_outcome(outcome)


@tool
async def get_latest_macro(indicator: Optional[str] = None, limit: int = 5) -> dict:
    """Load the latest macro-economic backdrop data (inflation, rates, etc)."""
    repository = get_agent_repository()
    research_tools = ResearchAgentTools(repository)
    outcome = await research_tools.get_latest_macro(indicator, limit)
    return serialize_outcome(outcome)


@tool
async def get_latest_pse_records(ticker: str, limit: int = 5) -> dict:
    """Load historical persisted PSE records (EOD pricing) for a ticker."""
    repository = get_agent_repository()
    research_tools = ResearchAgentTools(repository)
    outcome = await research_tools.get_latest_pse_records(ticker, limit)
    return serialize_outcome(outcome)


@tool
async def search_user_threads(limit: int = 10, config: RunnableConfig = None) -> dict:
    """Load recent AGOS thread history for memory and operator context."""
    if config is None:
        raise RuntimeError("Agent runtime config missing")
    runtime = get_runtime(config)
    repository = get_agent_repository()
    research_tools = ResearchAgentTools(repository)
    outcome = await research_tools.search_user_threads(str(runtime["user_id"]), limit)
    return serialize_outcome(outcome)


@tool
async def evaluate_trade(ticker: str, config: RunnableConfig) -> dict:
    """Request a guarded trade evaluation for a ticker from the ML Engine."""
    context: AgentRuntimeContext = config["configurable"]["context"]
    runtime = get_runtime(config)
    outcome = await engine_tools.evaluate_trade(
        user_id=str(runtime["user_id"]),
        ticker=ticker,
        lookback_days=context.lookback_days,
        auth_token=runtime.get("auth_token"),
    )
    return serialize_outcome(outcome)


TOOL_GROUPS: dict[str, list[BaseTool]] = {
    "portfolio": [get_portfolio_snapshot, get_portfolio_holding],
    "market": [get_market_overview, get_financial_data, get_financial_reports],
    "research": [get_latest_news, get_latest_macro, get_latest_pse_records, search_user_threads],
    "engine": [evaluate_trade],
}

ROLE_TOOL_GROUPS: dict[str, list[str]] = {
    "coordinator": ["portfolio", "market", "research", "engine"],
    "research-lead": ["research", "market"],
    "web-investigator": ["research"],
    "portfolio-analyst": ["portfolio", "market"],
    "risk-sentinel": ["market", "research", "engine"],
    "execution-guard": ["portfolio", "market", "engine"],
}

SERVER_TOOL_LABELS = {
    "google_search": "Web search",
    "code_execution": "Code interpreter",
    "url_context": "URL context",
}


def _dedupe_tools(tools: Iterable[BaseTool]) -> list[BaseTool]:
    ordered: list[BaseTool] = []
    seen: set[str] = set()
    for tool_item in tools:
        if tool_item.name in seen:
            continue
        seen.add(tool_item.name)
        ordered.append(tool_item)
    return ordered


def _enabled_groups(mode: str, tool_settings: AgentToolSettings | None) -> list[str]:
    selected = tool_settings or AgentToolSettings()
    groups: list[str] = []
    if selected.portfolio:
        groups.append("portfolio")
    if selected.market:
        groups.append("market")
    if selected.research:
        groups.append("research")
    if selected.engine and mode == "trading":
        groups.append("engine")
    return groups


def get_available_tools(
    mode: str,
    *,
    tool_settings: AgentToolSettings | None = None,
    role: str | None = None,
) -> list[BaseTool]:
    allowed_groups = set(_enabled_groups(mode, tool_settings))
    requested_groups = ROLE_TOOL_GROUPS.get(role or "coordinator", list(TOOL_GROUPS))
    tools: list[BaseTool] = []
    for group in requested_groups:
        if group not in allowed_groups:
            continue
        tools.extend(TOOL_GROUPS[group])
    return _dedupe_tools(tools)


def get_tool_index(
    mode: str,
    *,
    tool_settings: AgentToolSettings | None = None,
    role: str | None = None,
) -> dict[str, BaseTool]:
    return {tool_item.name: tool_item for tool_item in get_available_tools(mode, tool_settings=tool_settings, role=role)}


def get_server_tools(tool_settings: AgentToolSettings | None = None) -> list[dict]:
    selected = tool_settings or AgentToolSettings()
    server_tools: list[dict] = []
    if selected.webSearch:
        server_tools.append({"google_search": {}})
    if selected.codeExecution:
        server_tools.append({"code_execution": {}})
    if selected.urlContext:
        server_tools.append({"url_context": {}})
    return server_tools


def describe_external_capabilities(capabilities: list[AgentExternalCapability]) -> list[str]:
    descriptions: list[str] = []
    for capability in capabilities:
        if not capability.enabled:
            continue
        noun = {
            "remote_mcp": "remote MCP",
            "custom_tool": "custom tool",
            "skill": "skill",
        }.get(capability.kind, capability.kind)
        if capability.status == "configured" and capability.endpoint:
            descriptions.append(f"Configured {noun} {capability.label} at {capability.endpoint}.")
        else:
            descriptions.append(f"Pluggable {noun} {capability.label} is staged but not yet active.")
    return descriptions

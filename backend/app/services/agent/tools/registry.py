from typing import Optional
from langchain_core.tools import tool
from langchain_core.runnables.config import RunnableConfig

from app.services.agent.state import AgentRuntimeContext, ToolOutcome
from app.services.agent.tools.portfolio import PortfolioAgentTools
from app.services.agent.tools.market import MarketAgentTools
from app.services.agent.tools.research import ResearchAgentTools
from app.services.agent.tools.engine import EngineAgentTools
from app.db.agent_cosmos import get_agent_repository


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

ALL_TOOLS = [
    get_portfolio_snapshot,
    get_portfolio_holding,
    get_market_overview,
    get_financial_data,
    get_financial_reports,
    get_latest_news,
    get_latest_macro,
    get_latest_pse_records,
    evaluate_trade,
]

def get_available_tools(mode: str) -> list:
    if mode == "trading":
        return ALL_TOOLS
    return [t for t in ALL_TOOLS if t.name != "evaluate_trade"]

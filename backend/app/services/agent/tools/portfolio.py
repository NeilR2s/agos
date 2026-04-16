from __future__ import annotations

from app.models.agent import Citation
from app.services.agent.state import ToolOutcome
from app.services.portfolio import PortfolioService


class PortfolioAgentTools:
    def __init__(self):
        self.service = PortfolioService()

    async def get_portfolio_snapshot(self, user_id: str) -> ToolOutcome:
        portfolio = await self.service.get_user_portfolio(user_id)
        payload = portfolio.model_dump(mode="json")
        summary = (
            f"Loaded {len(portfolio.holdings)} holdings with total portfolio value "
            f"{portfolio.totalPortfolioValue:.2f}."
        )
        return ToolOutcome(
            name="get_portfolio_snapshot",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label="Portfolio snapshot",
                    source="portfolio",
                    kind="portfolio",
                    meta={"userId": user_id, "holdings": len(portfolio.holdings)},
                )
            ],
        )

    async def get_portfolio_holding(self, user_id: str, ticker: str) -> ToolOutcome:
        holding = await self.service.get_holding(user_id, ticker)
        payload = holding.model_dump(mode="json") if holding else {"ticker": ticker.upper(), "holding": None}
        summary = f"Resolved portfolio exposure for {ticker.upper()}."
        return ToolOutcome(
            name="get_portfolio_holding",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label=f"Holding lookup: {ticker.upper()}",
                    source="portfolio",
                    kind="portfolio",
                    meta={"userId": user_id, "ticker": ticker.upper()},
                )
            ],
        )

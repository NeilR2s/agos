from __future__ import annotations

from app.models.agent import Citation
from app.services.agent.state import ToolOutcome
from app.services.scraper import PSEService


class MarketAgentTools:
    def __init__(self):
        self.service = PSEService()

    async def get_market_overview(self, ticker: str) -> ToolOutcome:
        data = await self.service.get_ticker_details(ticker)
        payload = data or {"ticker": ticker.upper(), "error": "Ticker not found"}
        summary = f"Loaded market overview for {ticker.upper()}."
        return ToolOutcome(
            name="get_market_overview",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label=f"Market overview: {ticker.upper()}",
                    source="pse_market",
                    kind="market",
                    href="https://edge.pse.com.ph/",
                    meta={"ticker": ticker.upper()},
                )
            ],
        )

    async def get_market_chart(self, ticker: str, start_date: str | None = None, end_date: str | None = None) -> ToolOutcome:
        data = await self.service.get_ticker_chart_data(ticker, start_date, end_date)
        payload = {"ticker": ticker.upper(), "chartData": data}
        summary = f"Loaded {len(data)} chart points for {ticker.upper()}."
        return ToolOutcome(
            name="get_market_chart",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label=f"Price history: {ticker.upper()}",
                    source="pse_market",
                    kind="chart",
                    href="https://edge.pse.com.ph/",
                    meta={"ticker": ticker.upper(), "points": len(data)},
                )
            ],
        )

    async def get_financial_data(self, ticker: str) -> ToolOutcome:
        data = await self.service.get_financial_data(ticker)
        payload = {"ticker": ticker.upper(), "financialData": data}
        summary = f"Loaded {len(data)} financial disclosures for {ticker.upper()}."
        return ToolOutcome(
            name="get_financial_data",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label=f"Financial filings: {ticker.upper()}",
                    source="pse_financials",
                    kind="financials",
                    href="https://edge.pse.com.ph/",
                    meta={"ticker": ticker.upper(), "documents": len(data)},
                )
            ],
        )

    async def get_financial_reports(self, ticker: str) -> ToolOutcome:
        data = await self.service.get_financial_reports(ticker)
        payload = {"ticker": ticker.upper(), "financialReports": data}
        summary = f"Loaded parsed financial reports for {ticker.upper()}."
        return ToolOutcome(
            name="get_financial_reports",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label=f"Parsed reports: {ticker.upper()}",
                    source="pse_financials",
                    kind="financials",
                    href="https://edge.pse.com.ph/",
                    meta={"ticker": ticker.upper()},
                )
            ],
        )

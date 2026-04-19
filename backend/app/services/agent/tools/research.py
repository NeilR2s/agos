from __future__ import annotations

from app.db.agent_cosmos import AgentCosmosRepository
from app.db.cosmos import get_db
from app.models.agent import Citation
from app.services.agent.state import ToolOutcome


class ResearchAgentTools:
    def __init__(self, repository: AgentCosmosRepository):
        self.db = get_db()
        self.repository = repository

    async def get_latest_news(self, ticker: str, limit: int = 5) -> ToolOutcome:
        items = await self.db.get_latest_news_data(ticker=ticker, limit=limit)
        summary = f"Loaded {len(items)} recent news sentiment records for {ticker.upper()}."
        citations = [
            Citation(
                label=item.get("title") or item.get("headline") or f"News item {index + 1}",
                source="news_sentiment_data",
                kind="news",
                href=item.get("url") or item.get("link"),
                excerpt=item.get("summary") or item.get("snippet"),
                meta={"ticker": ticker.upper(), "date": item.get("date")},
            )
            for index, item in enumerate(items[:3])
        ]
        return ToolOutcome(
            name="get_latest_news",
            summary=summary,
            payload={"ticker": ticker.upper(), "items": items},
            citations=citations,
        )

    async def get_latest_macro(self, indicator: str | None = None, limit: int = 5) -> ToolOutcome:
        items = await self.db.get_latest_macro_data(indicator=indicator, limit=limit)
        summary = f"Loaded {len(items)} macro records for AGOS context."
        citations = [
            Citation(
                label=item.get("indicator") or f"Macro item {index + 1}",
                source="macro_data",
                kind="macro",
                excerpt=str(item.get("value")),
                meta={"date": item.get("date")},
            )
            for index, item in enumerate(items[:3])
        ]
        return ToolOutcome(
            name="get_latest_macro",
            summary=summary,
            payload={"indicator": indicator, "items": items},
            citations=citations,
        )

    async def get_latest_pse_records(self, ticker: str, limit: int = 5) -> ToolOutcome:
        items = await self.db.get_latest_pse_data(ticker=ticker, limit=limit)
        summary = f"Loaded {len(items)} persisted PSE records for {ticker.upper()}."
        citations = [
            Citation(
                label=f"PSE record {index + 1}",
                source="pse_stock_data",
                kind="market",
                meta={"ticker": ticker.upper(), "date": item.get("date")},
            )
            for index, item in enumerate(items[:3])
        ]
        return ToolOutcome(
            name="get_latest_pse_records",
            summary=summary,
            payload={"ticker": ticker.upper(), "items": items},
            citations=citations,
        )

    async def search_user_threads(self, user_id: str, limit: int = 10) -> ToolOutcome:
        threads = await self.repository.list_threads(user_id=user_id, limit=limit)
        summary = f"Loaded {len(threads)} recent threads for the operator."
        return ToolOutcome(
            name="search_user_threads",
            summary=summary,
            payload={"threads": [thread.model_dump(mode="json") for thread in threads]},
            citations=[
                Citation(
                    label="Agent thread history",
                    source="agent_threads",
                    kind="memory",
                    meta={"count": len(threads)},
                )
            ],
        )

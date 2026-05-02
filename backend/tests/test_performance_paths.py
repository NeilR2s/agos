import asyncio

import pytest

from app.db.agent_cosmos import AgentCosmosRepository
from app.db.cosmos import CosmosDB
from app.models.agent import AgentMessage
from app.services.map_service import load_map_state
from app.services.portfolio import PortfolioService
from app.services.scraper import PSEService


def async_items(items):
    async def iterator():
        for item in items:
            yield item

    return iterator()


class CaptureContainer:
    def __init__(self, items=None):
        self.items = items or []
        self.calls = []

    def query_items(self, **kwargs):
        self.calls.append(kwargs)
        return async_items(self.items)


@pytest.mark.asyncio
async def test_cosmos_filtered_data_queries_use_partition_keys():
    db = object.__new__(CosmosDB)
    db.news_container = CaptureContainer()
    db.pse_container = CaptureContainer()
    db.macro_container = CaptureContainer()

    await db.get_latest_news_data(ticker="ali", limit=5)
    await db.get_latest_pse_data(ticker="bdo", limit=5)
    await db.get_latest_macro_data(indicator="inflation", limit=5)

    assert db.news_container.calls[0]["partition_key"] == "ALI"
    assert db.pse_container.calls[0]["partition_key"] == "BDO"
    assert db.macro_container.calls[0]["partition_key"] == "inflation"


@pytest.mark.asyncio
async def test_map_events_query_applies_server_side_limit():
    db = object.__new__(CosmosDB)
    db.map_events_container = CaptureContainer()

    await db.list_map_events(limit=7)

    call = db.map_events_container.calls[0]
    assert "ORDER BY c.timestamp DESC" in call["query"]
    assert {"name": "@limit", "value": 7} in call["parameters"]


@pytest.mark.asyncio
async def test_agent_repository_list_messages_uses_thread_partition_key():
    repo = object.__new__(AgentCosmosRepository)
    repo.messages_container = CaptureContainer(
        [
            AgentMessage(
                id="message-1",
                threadId="thread-1",
                runId=None,
                role="user",
                content="hello",
                createdAt="2026-01-01T00:00:00Z",
            ).model_dump(mode="json")
        ]
    )

    messages = await repo.list_messages("thread-1")

    assert len(messages) == 1
    assert repo.messages_container.calls[0]["partition_key"] == "thread-1"


class ConcurrentMapDb:
    def __init__(self):
        self.active = 0
        self.max_active = 0

    async def _load(self):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0.01)
        self.active -= 1
        return []

    async def list_map_assets(self):
        return await self._load()

    async def list_map_zones(self):
        return await self._load()

    async def list_map_connections(self):
        return await self._load()

    async def list_map_tracks(self):
        return await self._load()

    async def list_map_events(self):
        return await self._load()


@pytest.mark.asyncio
async def test_map_state_loads_containers_concurrently():
    db = ConcurrentMapDb()

    await load_map_state(db)

    assert db.max_active > 1


class PortfolioDb:
    async def get_portfolio(self, user_id):
        return [
            {
                "id": f"{user_id}_ALI_1",
                "userId": user_id,
                "type": "holding",
                "ticker": "ALI",
                "shares": 10,
                "avgPrice": 20,
            },
            {
                "id": f"{user_id}_ALI_2",
                "userId": user_id,
                "type": "holding",
                "ticker": "ali",
                "shares": 5,
                "avgPrice": 22,
            },
            {"id": f"{user_id}_cash", "userId": user_id, "type": "cash", "amount": 100},
        ]


class PortfolioScraper:
    def __init__(self):
        self.calls = 0

    async def get_ticker_details(self, ticker):
        self.calls += 1
        await asyncio.sleep(0)
        return {"price": 25}


@pytest.mark.asyncio
async def test_portfolio_enrichment_dedupes_ticker_price_fetches():
    service = object.__new__(PortfolioService)
    service.db = PortfolioDb()
    service.scraper = PortfolioScraper()

    portfolio = await service.get_user_portfolio("user-1")

    assert service.scraper.calls == 1
    assert len(portfolio.holdings) == 2
    assert portfolio.totalMarketValue == 375


class SearchResponse:
    ok = True
    content = b"""
    <table class="list">
      <tr><th>Company</th><th>Symbol</th></tr>
      <tr><td>Ayala Land</td><td><a onclick="cmDetail('101','202')">ALI</a></td></tr>
    </table>
    """


class CompanyInfoSession:
    def __init__(self):
        self.posts = 0

    async def post(self, *args, **kwargs):
        self.posts += 1
        return SearchResponse()


@pytest.mark.asyncio
async def test_pse_company_info_cache_avoids_repeat_lookup():
    PSEService._company_info_cache.clear()
    service = PSEService()
    session = CompanyInfoSession()

    first = await service.get_company_info(session, "ali")
    second = await service.get_company_info(session, "ALI")

    assert first == second
    assert session.posts == 1
    PSEService._company_info_cache.clear()


class FileLinkResponse:
    text = """
    <div id="viewOption">
      <p>unused</p>
      <p><select><option value="old"></option><option value="new-file"></option></select></p>
    </div>
    """


class FileLinkSession:
    def __init__(self):
        self.active = 0
        self.max_active = 0

    async def get(self, *args, **kwargs):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0.01)
        self.active -= 1
        return FileLinkResponse()


@pytest.mark.asyncio
async def test_financial_file_links_are_resolved_concurrently():
    html = """
    <table>
      <tr><td>Co</td><td>Q1</td><td>17-Q</td><td>01-01-2026</td><td>R1</td><td><a href="#viewer" onclick="open('E1')">View</a></td></tr>
      <tr><td>Co</td><td>Q2</td><td>17-Q</td><td>04-01-2026</td><td>R2</td><td><a href="#viewer" onclick="open('E2')">View</a></td></tr>
      <tr><td>Co</td><td>Q3</td><td>17-Q</td><td>07-01-2026</td><td>R3</td><td><a href="#viewer" onclick="open('E3')">View</a></td></tr>
    </table>
    """
    service = PSEService()
    session = FileLinkSession()

    data = await service._parse_financial_data(session, html, limit=3)

    assert session.max_active > 1
    assert [item["FileLink"] for item in data] == [
        "https://edge.pse.com.ph/downloadHtml.do?file_id=new-file",
        "https://edge.pse.com.ph/downloadHtml.do?file_id=new-file",
        "https://edge.pse.com.ph/downloadHtml.do?file_id=new-file",
    ]

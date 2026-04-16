import asyncio
from datetime import UTC, datetime, timedelta

from app.core.data_provider import DataProvider
from app.models.schemas import PriceDataPoint


class _FakeContainer:
    def __init__(self, items):
        self._items = items

    def query_items(self, *args, **kwargs):
        return self._iterate()

    async def _iterate(self):
        for item in self._items:
            yield item


class _FakeDatabase:
    def __init__(self, items):
        self._container = _FakeContainer(items)

    def get_container_client(self, name):
        return self._container


class _FakeCosmosClient:
    def __init__(self, items):
        self._database = _FakeDatabase(items)

    def get_database_client(self, name):
        return self._database


def test_fetch_historical_prices_uses_backend_chart_when_cosmos_history_is_sparse(monkeypatch):
    provider = DataProvider()
    provider.cosmos_uri = "https://example.cosmos.local"
    provider.cosmos_key = "test-key"

    cosmos_items = [
        {
            "timestamp": (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%d"),
            "close": 100.0,
            "high": 101.0,
            "low": 99.0,
            "open": 100.0,
            "volume": 1000,
        }
    ]
    backend_prices = [
        PriceDataPoint(
            timestamp=(datetime.now(UTC) - timedelta(days=day)).strftime("%m-%d-%Y"),
            close=100.0 + day,
            high=101.0 + day,
            low=99.0 + day,
            open=100.0 + day,
            volume=1000 + day,
        )
        for day in range(14)
    ]

    async def fake_get_cosmos_client():
        return _FakeCosmosClient(cosmos_items)

    async def fake_fetch_backend_chart_prices(ticker, lookback_days):
        assert ticker == "JGS"
        assert lookback_days == 30
        return backend_prices

    monkeypatch.setattr(provider, "get_cosmos_client", fake_get_cosmos_client)
    monkeypatch.setattr(provider, "_fetch_backend_chart_prices", fake_fetch_backend_chart_prices)

    result = asyncio.run(provider.fetch_historical_prices("jgs", 30))

    assert len(result) == 14
    assert [point.timestamp for point in result] == [point.timestamp for point in backend_prices]
    assert result[0].close == backend_prices[0].close

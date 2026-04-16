from unittest.mock import AsyncMock, MagicMock

import pytest
from azure.cosmos.aio import DatabaseProxy

from base_scraper import BaseScraper


class DummyScraper(BaseScraper):
    async def scrape_and_process(self):
        return True


@pytest.mark.asyncio
async def test_fetch_success():
    db_client = AsyncMock(spec=DatabaseProxy)
    scraper = DummyScraper(db_client)

    mock_session = AsyncMock()
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_session.get.return_value = mock_response

    endpoint = "test-endpoint"
    result = await scraper.fetch(mock_session, "GET", endpoint)

    assert result == mock_response
    mock_session.get.assert_called_once_with(endpoint)
    mock_response.raise_for_status.assert_called_once()


@pytest.mark.asyncio
async def test_generate_hash():
    scraper = DummyScraper(AsyncMock())
    h1 = scraper.generate_hash("2024-01-01", "PSA", "GDP")
    h2 = scraper.generate_hash("2024-01-01", "PSA", "GDP")
    h3 = scraper.generate_hash("2024-01-02", "PSA", "GDP")

    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64  # SHA256 hex length


@pytest.mark.asyncio
async def test_upsert_logic():
    mock_container = AsyncMock()
    mock_db = AsyncMock(spec=DatabaseProxy)
    mock_db.get_container_client.return_value = mock_container

    scraper = DummyScraper(mock_db)

    test_data = {"hash": "abc", "value": 123, "ticker": "AAA"}
    await scraper.upsert("test_container", test_data)

    # Check if hash was mapped to id and upsert_item was called
    args, kwargs = mock_container.upsert_item.call_args
    upserted_item = args[0]

    assert upserted_item["id"] == "abc"
    assert "hash" not in upserted_item
    assert upserted_item["value"] == 123
    assert "scraped_at" in upserted_item

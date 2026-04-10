from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from base_scraper import BaseScraper


class DummyScraper(BaseScraper):
    async def scrape_and_process(self):
        return True

@pytest.mark.asyncio
async def test_fetch_success():
    db_session = AsyncMock(spec=AsyncSession)
    scraper = DummyScraper(db_session)

    mock_session = AsyncMock()
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_session.get.return_value = mock_response

    result = await scraper.fetch(mock_session, "GET", "http://test.com")

    assert result == mock_response
    mock_session.get.assert_called_once_with("http://test.com")
    mock_response.raise_for_status.assert_called_once()

@pytest.mark.asyncio
async def test_generate_hash():
    scraper = DummyScraper(AsyncMock())
    h1 = scraper.generate_hash("2024-01-01", "PSA", "GDP")
    h2 = scraper.generate_hash("2024-01-01", "PSA", "GDP")
    h3 = scraper.generate_hash("2024-01-02", "PSA", "GDP")

    assert h1 == h2
    assert h1 != h3
    assert len(h1) == 64 # SHA256 hex length

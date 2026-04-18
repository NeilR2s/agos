from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from config import settings
from news_scraper import GeoEventCandidate, NewsArticle, NewsArticlesResponse, NewsScraper


def build_article(*, geo_events: list[GeoEventCandidate]) -> NewsArticle:
    return NewsArticle(
        date="2026-04-18",
        url="https://example.com/article",
        title="Example article",
        source="Example News",
        tickers=["SM"],
        ticker="SM",
        sentiment_label="Positive",
        sentiment_score=0.5,
        summary="Example summary.",
        category="Financials",
        geo_events=geo_events,
    )


@pytest.mark.asyncio
async def test_build_map_event_uses_broad_location_fallback_and_preserves_shape():
    scraper = NewsScraper(AsyncMock())
    article = build_article(
        geo_events=[
            GeoEventCandidate(
                title="National policy shift",
                kind="regulatory",
                severity="high",
                detail="National policy change is expected to affect operating conditions.",
                place_name="Philippines",
                location_scope="country",
            )
        ]
    )

    event = await scraper._build_map_event(article, "article-1", article.geo_events[0])

    assert event is not None
    assert event["location"] == [122.0, 12.8]
    assert event["zoneId"] == "zone-philippines"
    assert event["eventDate"] == "2026-04-18"
    assert event["timestamp"] == "2026-04-18T12:00:00Z"
    assert event["ticker"] == "SM"
    assert event["sourceArticleId"] == "article-1"
    assert event["locationScope"] == "country"


@pytest.mark.asyncio
async def test_upsert_geo_events_persists_normalized_event(monkeypatch):
    scraper = NewsScraper(AsyncMock())
    writes = []

    async def fake_geocode(place_name, location_scope):
        assert place_name == "Makati"
        assert location_scope == "city"
        return {"coordinates": [121.0244, 14.5547], "zone_id": "zone-makati-core"}

    async def fake_upsert(container_name, values):
        writes.append((container_name, values.copy()))

    monkeypatch.setattr(scraper, "_geocode_place", fake_geocode)
    monkeypatch.setattr(scraper, "upsert", fake_upsert)

    article = build_article(
        geo_events=[
            GeoEventCandidate(
                title="Trading desk surge",
                kind="market",
                severity="medium",
                detail="Trading activity intensified around the Makati core.",
                place_name="Makati",
                location_scope="city",
                timestamp="2026-04-18T09:30:00Z",
            )
        ]
    )

    count = await scraper._upsert_geo_events(article, "article-2")

    assert count == 1
    assert len(writes) == 1
    container_name, payload = writes[0]
    assert container_name == settings.COSMOS_MAP_EVENTS_CONTAINER
    assert payload["title"] == "TRADING DESK SURGE"
    assert payload["zoneId"] == "zone-makati-core"
    assert payload["assetId"] == "asset-makati-grid"
    assert payload["eventDate"] == "2026-04-18"
    assert payload["location"] == [121.0244, 14.5547]
    assert payload["hash"]


@pytest.mark.asyncio
async def test_infer_zone_id_prefers_smallest_matching_zone():
    scraper = NewsScraper(AsyncMock())

    zone_id = scraper._infer_zone_id([121.0244, 14.5547])

    assert zone_id == "zone-makati-core"


@pytest.mark.asyncio
async def test_scrape_category_agent_keeps_article_write_when_event_resolution_fails(monkeypatch):
    scraper = NewsScraper(AsyncMock())
    writes = []

    async def fake_tavily(_payload):
        return {"results": [{"url": "https://example.com/article", "content": "sample context"}]}

    async def fake_llm(_prompt):
        return NewsArticlesResponse(
            articles=[
                build_article(
                    geo_events=[
                        GeoEventCandidate(
                            title="Distant supply pressure",
                            kind="logistics",
                            severity="high",
                            detail="A supply issue is emerging outside the local network.",
                            place_name="Unresolved Place",
                            location_scope="global",
                        )
                    ]
                )
            ]
        )

    async def fake_upsert(container_name, values):
        writes.append((container_name, values.copy()))

    async def fake_geocode(_place_name, _location_scope):
        return None

    scraper.tavily = SimpleNamespace(ainvoke=fake_tavily)
    scraper.llm = SimpleNamespace(ainvoke=fake_llm)
    monkeypatch.setattr(scraper, "upsert", fake_upsert)
    monkeypatch.setattr(scraper, "_geocode_place", fake_geocode)

    count = await scraper._scrape_category_agent("Financials")

    assert count == 1
    assert len(writes) == 1
    assert writes[0][0] == settings.COSMOS_NEWS_CONTAINER
    assert writes[0][1]["title"] == "Example article"

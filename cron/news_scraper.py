import asyncio
from datetime import UTC, datetime
from typing import Any, Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_tavily import TavilySearch
from pydantic import BaseModel, Field

from base_scraper import BaseScraper
from config import settings
from map_reference_data import MAP_ASSETS, MAP_ZONES


DEFAULT_EVENT_TIME = "T12:00:00Z"
PHILIPPINE_SCOPES = {"site", "city", "metro", "region", "country"}
ALLOWED_EVENT_KINDS = {"alert", "regulatory", "logistics", "market", "movement", "inspection", "handoff", "macro"}
ALLOWED_SEVERITIES = {"low", "medium", "high"}
LOCATION_FALLBACKS = {
    "metro manila": {"coordinates": [121.0, 14.6], "zone_id": "zone-metro-manila"},
    "national capital region": {"coordinates": [121.0, 14.6], "zone_id": "zone-metro-manila"},
    "ncr": {"coordinates": [121.0, 14.6], "zone_id": "zone-metro-manila"},
    "manila": {"coordinates": [120.9842, 14.5995], "zone_id": "zone-metro-manila"},
    "luzon": {"coordinates": [121.0, 16.0], "zone_id": "zone-luzon"},
    "visayas": {"coordinates": [123.6, 11.0], "zone_id": "zone-visayas"},
    "mindanao": {"coordinates": [125.0, 7.3], "zone_id": "zone-mindanao"},
    "philippines": {"coordinates": [122.0, 12.8], "zone_id": "zone-philippines"},
    "south china sea": {"coordinates": [114.5, 14.0], "zone_id": "zone-south-china-sea"},
    "southeast asia": {"coordinates": [108.0, 10.0], "zone_id": "zone-southeast-asia"},
    "asean": {"coordinates": [108.0, 10.0], "zone_id": "zone-southeast-asia"},
    "china": {"coordinates": [104.0, 35.0], "zone_id": "zone-china"},
    "united states": {"coordinates": [-98.5, 39.8], "zone_id": "zone-united-states"},
    "u.s.": {"coordinates": [-98.5, 39.8], "zone_id": "zone-united-states"},
    "usa": {"coordinates": [-98.5, 39.8], "zone_id": "zone-united-states"},
    "middle east": {"coordinates": [48.0, 26.0], "zone_id": "zone-middle-east"},
    "red sea": {"coordinates": [40.3, 19.0], "zone_id": "zone-middle-east"},
}


class GeoEventCandidate(BaseModel):
    title: str = Field(description="Short event title in uppercase operational style.")
    kind: str = Field(description="One of alert, regulatory, logistics, market, movement, inspection, handoff, or macro.")
    severity: str = Field(description="One of low, medium, or high.")
    detail: str = Field(description="One concise sentence explaining why the event matters.")
    place_name: str = Field(description="Specific place or broader geography mentioned in the article.")
    location_scope: str = Field(description="One of site, city, metro, region, country, or global.")
    timestamp: Optional[str] = Field(default=None, description="ISO 8601 timestamp if known. If exact time is unknown, omit it.")
    ticker: Optional[str] = Field(default=None, description="Primary ticker impacted by this event when applicable.")
    asset_id: Optional[str] = Field(default=None, description="Specific seeded asset ID only when the article is explicit.")
    zone_id: Optional[str] = Field(default=None, description="Specific seeded zone ID only when the article is explicit.")


class NewsArticle(BaseModel):
    """Schema for news articles that impact stock prices."""

    date: str = Field(description="The date of the news in YYYY-MM-DD format.")
    url: str = Field(description="The source URL of the news article.")
    title: str = Field(description="The title of the news article.")
    source: str = Field(description="The name of the news organization.")
    tickers: list[str] = Field(
        description="A list of stock ticker symbols affected by this news (e.g., ['SM', 'BDO'], ['TEL'])."
    )
    ticker: str = Field(
        description="The primary stock ticker symbol for database partitioning. Use the most relevant one from the tickers list."
    )
    sentiment_label: str = Field(
        description="The overall sentiment of the news: 'Positive', 'Neutral', or 'Negative'."
    )
    sentiment_score: float = Field(
        description="A sentiment score from -1.0 (very negative) to 1.0 (very positive)."
    )
    summary: str = Field(
        description="A brief summary (1-2 sentences) of why this news impacts the stock price."
    )
    category: str = Field(description="The industry or news category this article belongs to.")
    geo_events: list[GeoEventCandidate] = Field(
        default_factory=list,
        description="Zero or more material geospatial events inferred from the article.",
    )


class NewsArticlesResponse(BaseModel):
    """Response model containing a list of news articles."""

    articles: list[NewsArticle]


def normalize_place_name(place_name: str) -> str:
    return " ".join(place_name.lower().replace(",", " ").split())


def normalize_timestamp(timestamp: Optional[str], fallback_date: str) -> str:
    value = (timestamp or "").strip()
    if not value:
        return f"{fallback_date}{DEFAULT_EVENT_TIME}"
    if len(value) == 10:
        return f"{value}{DEFAULT_EVENT_TIME}"
    if value.endswith("Z"):
        return value
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return f"{fallback_date}{DEFAULT_EVENT_TIME}"
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")


def point_in_polygon(point: list[float], polygon: list[list[float]]) -> bool:
    x, y = point
    inside = False
    for index in range(len(polygon)):
        prev_index = (index - 1) % len(polygon)
        xi, yi = polygon[index]
        xj, yj = polygon[prev_index]
        intersects = (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi)) / ((yj - yi) or 1e-12) + xi
        if intersects:
            inside = not inside
    return inside


def polygon_area_hint(polygon: list[list[float]]) -> float:
    lngs = [point[0] for point in polygon]
    lats = [point[1] for point in polygon]
    return (max(lngs) - min(lngs)) * (max(lats) - min(lats))


class NewsScraper(BaseScraper):
    """
    Scraper for news sentiment analysis using Tavily and Gemini.
    """

    TRUSTED_SOURCES = [
        # Industry Standard
        "philstar.com", 
        "inquirer.net", 
        "bworldonline.com",
        "businessinsider.com", # Note: BI frequently uses a hard paywall for premium/finance content.
        
        # Global Finance & Economy
        "finance.yahoo.com",   
        "cnbc.com",            
        "apnews.com",          
        "theguardian.com",     
        "investopedia.com",    
        
        # Philippines Business & Market News
        "gmanetwork.com",      
        "news.abs-cbn.com",    
        "manilatimes.net",     
        "pna.gov.ph"
    ]
    
    CATEGORIES = [
        "Financials",
        "Industrial",
        "Holding Firms",
        "Property",
        "Services",
        "Mining&Oil",
        "Regulatory Changes (Philippines)",
        "Political (Global News)",
    ]

    def __init__(self, db_client):
        super().__init__(db_client)
        self.tavily = TavilySearch(
            max_results=15, include_domains=self.TRUSTED_SOURCES, search_depth="advanced", tavily_api_key=settings.TAVILY_API_KEY
        )
        self.llm = (
            ChatGoogleGenerativeAI(
                model="gemini-3-flash-preview",
                temperature=1,
                thinking_level = "high",
                google_api_key=settings.GEMINI_API_KEY,
            )
            .bind_tools([{"google_search": {}}])
            .with_structured_output(NewsArticlesResponse)
        )
        self._geocode_cache: dict[str, Optional[dict[str, Any]]] = {}
        self._zones_by_id = {zone["id"]: zone for zone in MAP_ZONES}
        self._assets_by_id = {asset["id"]: asset for asset in MAP_ASSETS}

    def _fallback_location(self, place_name: str) -> Optional[dict[str, Any]]:
        normalized = normalize_place_name(place_name)
        if normalized in LOCATION_FALLBACKS:
            return LOCATION_FALLBACKS[normalized]
        for key, value in LOCATION_FALLBACKS.items():
            if key in normalized:
                return value
        return None

    async def _geocode_place(self, place_name: str, location_scope: str) -> Optional[dict[str, Any]]:
        normalized = normalize_place_name(place_name)
        if normalized in self._geocode_cache:
            return self._geocode_cache[normalized]

        fallback = self._fallback_location(place_name)
        if fallback:
            self._geocode_cache[normalized] = fallback
            return fallback

        if not settings.GEOAPIFY_KEY:
            self._geocode_cache[normalized] = None
            return None

        params: dict[str, Any] = {
            "text": place_name,
            "format": "json",
            "limit": 1,
            "apiKey": settings.GEOAPIFY_KEY,
        }
        if location_scope in PHILIPPINE_SCOPES:
            params["filter"] = "countrycode:ph"

        try:
            async with self.get_http_session() as session:
                response = await self.fetch(
                    session,
                    "GET",
                    "https://api.geoapify.com/v1/geocode/search",
                    params=params,
                    headers={"Accept": "application/json"},
                )
                payload = response.json()
        except Exception as exc:
            self.logger.warning(f"Geoapify geocode failed for '{place_name}': {exc}")
            self._geocode_cache[normalized] = None
            return None

        results = payload.get("results", []) if isinstance(payload, dict) else []
        if not results:
            self._geocode_cache[normalized] = None
            return None

        result = results[0]
        coordinates = [result.get("lon"), result.get("lat")]
        if coordinates[0] is None or coordinates[1] is None:
            self._geocode_cache[normalized] = None
            return None

        geocoded = {"coordinates": coordinates, "zone_id": None}
        self._geocode_cache[normalized] = geocoded
        return geocoded

    def _infer_zone_id(self, coordinates: list[float]) -> Optional[str]:
        matched_zone_id = None
        matched_zone_area = float("inf")
        for zone in MAP_ZONES:
            if point_in_polygon(coordinates, zone["coordinates"]):
                zone_area = polygon_area_hint(zone["coordinates"])
                if zone_area < matched_zone_area:
                    matched_zone_id = zone["id"]
                    matched_zone_area = zone_area
        return matched_zone_id

    def _infer_asset_id(self, coordinates: list[float], zone_id: Optional[str], candidate_asset_id: Optional[str]) -> Optional[str]:
        if candidate_asset_id in self._assets_by_id:
            return candidate_asset_id
        if zone_id:
            zone_assets = [asset for asset in MAP_ASSETS if asset.get("zoneId") == zone_id]
            if len(zone_assets) == 1:
                return zone_assets[0]["id"]

        closest_asset_id = None
        closest_distance = float("inf")
        for asset in MAP_ASSETS:
            lng_delta = asset["location"][0] - coordinates[0]
            lat_delta = asset["location"][1] - coordinates[1]
            distance = (lng_delta * lng_delta) + (lat_delta * lat_delta)
            if distance < closest_distance:
                closest_distance = distance
                closest_asset_id = asset["id"]

        return closest_asset_id if closest_distance <= 0.04 else None

    async def _build_map_event(self, article: NewsArticle, article_id: str, candidate: GeoEventCandidate) -> Optional[dict[str, Any]]:
        place_name = candidate.place_name.strip()
        if not place_name:
            return None

        resolved = await self._geocode_place(place_name, candidate.location_scope)
        if not resolved:
            return None

        timestamp = normalize_timestamp(candidate.timestamp, article.date)
        zone_id = candidate.zone_id if candidate.zone_id in self._zones_by_id else resolved.get("zone_id")
        if not zone_id:
            zone_id = self._infer_zone_id(resolved["coordinates"])

        asset_id = self._infer_asset_id(resolved["coordinates"], zone_id, candidate.asset_id)
        event_id = self.generate_hash(article_id, candidate.title.strip().upper(), place_name.lower(), timestamp)

        return {
            "hash": event_id,
            "title": candidate.title.strip().upper(),
            "kind": candidate.kind.strip().lower() if candidate.kind.strip().lower() in ALLOWED_EVENT_KINDS else "alert",
            "severity": candidate.severity.strip().lower() if candidate.severity.strip().lower() in ALLOWED_SEVERITIES else "medium",
            "timestamp": timestamp,
            "eventDate": timestamp.split("T", 1)[0],
            "location": resolved["coordinates"],
            "detail": candidate.detail.strip(),
            "assetId": asset_id,
            "zoneId": zone_id,
            "ticker": (candidate.ticker or article.ticker).upper() if (candidate.ticker or article.ticker) else None,
            "source": article.source,
            "sourceArticleId": article_id,
            "placeName": place_name,
            "locationScope": candidate.location_scope.strip().lower(),
        }

    async def _upsert_geo_events(self, article: NewsArticle, article_id: str) -> int:
        count = 0
        for candidate in article.geo_events:
            try:
                event = await self._build_map_event(article, article_id, candidate)
            except Exception as exc:
                self.logger.warning(f"Event normalization failed for article {article_id}: {exc}")
                continue
            if not event:
                continue
            await self.upsert(settings.COSMOS_MAP_EVENTS_CONTAINER, event)
            count += 1
        return count

    async def _scrape_category_agent(self, category: str) -> int:
        """
        An agent dedicated to scraping and analyzing news for a specific category.
        """
        self.logger.info(f"Agent starting for category: {category}")
        try:
            query = (
                f"latest Philippine stock market news regarding {category} category "
                f"impacting specific company prices " + " ".join(self.TRUSTED_SOURCES)
            )
            search_results = await self.tavily.ainvoke({"query": query})

            if not search_results or "results" not in search_results:
                self.logger.warning(f"No results found for category: {category}")
                return 0

            context = "\n---\n".join(
                [
                    f"Source: {res['url']}\nContent: {res['content']}"
                    for res in search_results["results"]
                ]
            )

            prompt = f"""
            Analyze the following news context regarding the '{category}' sector in the Philippines.
            Identify specific news articles that significantly impact the stock price of individual companies listed on the Philippine Stock Exchange (PSE).

            Rules:
            1. Only include news that is likely to move the stock price of a specific company.
            2. Extract all affected ticker symbols accurately as a list (e.g., ["SM", "BDO"]).
            3. Provide a single primary ticker symbol (the most relevant one) in the 'ticker' field for database partitioning.
            4. Provide a sentiment label and a score between -1.0 and 1.0.
            5. Summarize the impact in 1-2 sentences.
            6. Ensure the date is in YYYY-MM-DD format.
            7. Assign the category as '{category}'.
            8. For each article, optionally include geo_events only when the article describes a material operational, regulatory, logistics, macro, market, or geopolitical development.
            9. Geo event titles should be short uppercase labels.
            10. Geo events may use broad places like Metro Manila, Luzon, Philippines, Southeast Asia, China, United States, or Middle East when the article is not more specific.
            11. Do not invent coordinates. Use only place names and scopes.
            12. location_scope must be one of site, city, metro, region, country, or global.
            13. kind must be one of alert, regulatory, logistics, market, movement, inspection, handoff, or macro.
            14. severity must be one of low, medium, or high.
            15. Use your internal knowledge or Google Search grounding (if available) to verify facts if the context is ambiguous.

            Context:
            {context}
            """

            response = await self.llm.ainvoke(prompt)

            if not response or not response.articles:
                self.logger.info(f"No relevant news found for category: {category}")
                return 0

            count = 0
            geo_event_count = 0
            for article in response.articles:
                tickers_str = ",".join(sorted(article.tickers))
                article_id = self.generate_hash(article.date, article.url, tickers_str)
                article_dict = article.model_dump()
                article_dict.pop("geo_events", None)
                article_dict["hash"] = article_id
                await self.upsert(settings.COSMOS_NEWS_CONTAINER, article_dict)
                count += 1

                try:
                    geo_event_count += await self._upsert_geo_events(article, article_id)
                except Exception as exc:
                    self.logger.warning(f"Geo event persistence failed for article {article_id}: {exc}")

            self.logger.info(f"Agent for {category} processed {count} news items and {geo_event_count} geo-events.")
            return count

        except Exception as e:
            self.logger.error(f"Agent for {category} failed: {e}")
            return 0

    async def scrape_and_process(self) -> bool:
        self.logger.info("Starting multi-agent news sentiment scraping...")

        try:
            tasks = []
            async with asyncio.TaskGroup() as tg:
                for category in self.CATEGORIES:
                    tasks.append(tg.create_task(self._scrape_category_agent(category)))

            total_items = sum(t.result() for t in tasks)
            self.logger.info(f"Multi-agent news scraping completed. Total processed: {total_items}")
            return True

        except Exception as e:
            self.logger.error(f"Error in multi-agent news sentiment scraper: {e}")
            return False

import httpx
from typing import List, Optional
from datetime import datetime, UTC, timedelta
from azure.cosmos.aio import CosmosClient
from app.models.schemas import PriceDataPoint, PortfolioState
from app.utils.logger import get_engine_logger
from app.core.config import settings

logger = get_engine_logger(__name__)

class DataProvider:
    def __init__(self):
        self.cosmos_uri = settings.COSMOS_URI
        self.cosmos_key = settings.COSMOS_PRIMARY_KEY
        self.cosmos_db_id = settings.COSMOS_DATABASE_ID
        self.backend_url = settings.BACKEND_API_URL
        
        self._cosmos_client: Optional[CosmosClient] = None
        self._http_client: Optional[httpx.AsyncClient] = None

    async def get_cosmos_client(self) -> CosmosClient:
        if self._cosmos_client is None:
            self._cosmos_client = CosmosClient(self.cosmos_uri, credential=self.cosmos_key)
        return self._cosmos_client

    async def get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None:
            self._http_client = httpx.AsyncClient()
        return self._http_client

    async def close(self):
        """Closes all persistent clients."""
        if self._cosmos_client:
            await self._cosmos_client.close()
            self._cosmos_client = None
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None

    @staticmethod
    def _to_float(value: object) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str) and value.strip():
            try:
                return float(value)
            except ValueError:
                return None
        return None

    @classmethod
    def _coerce_price_point(cls, item: dict) -> Optional[PriceDataPoint]:
        timestamp = item.get("timestamp") or item.get("date") or item.get("CHART_DATE") or item.get("chart_date")
        close = item.get("close") if item.get("close") is not None else item.get("CLOSE")
        parsed_close = cls._to_float(close)

        if timestamp is None or parsed_close is None:
            return None

        return PriceDataPoint(
            timestamp=str(timestamp),
            close=parsed_close,
            high=cls._to_float(item.get("high") if item.get("high") is not None else item.get("HIGH")),
            low=cls._to_float(item.get("low") if item.get("low") is not None else item.get("LOW")),
            open=cls._to_float(item.get("open") if item.get("open") is not None else item.get("OPEN")),
            volume=cls._to_float(item.get("volume") if item.get("volume") is not None else item.get("VOLUME")),
        )

    @classmethod
    def _normalize_price_items(cls, items: List[dict]) -> List[PriceDataPoint]:
        prices: List[PriceDataPoint] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            price_point = cls._coerce_price_point(item)
            if price_point is not None:
                prices.append(price_point)
        return prices

    async def _fetch_backend_chart_prices(self, ticker: str, lookback_days: int, token: Optional[str] = None) -> List[PriceDataPoint]:
        url = f"{self.backend_url}/market/{ticker}/chart"
        now = datetime.now(UTC)
        params = {
            "start_date": (now - timedelta(days=lookback_days)).strftime("%m-%d-%Y"),
            "end_date": now.strftime("%m-%d-%Y"),
        }

        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        client = await self.get_http_client()
        response = await client.get(url, params=params, headers=headers)
        response.raise_for_status()

        payload = response.json()
        chart_data = payload.get("chartData", []) if isinstance(payload, dict) else []
        if not isinstance(chart_data, list):
            return []

        return self._normalize_price_items(chart_data)

    async def fetch_historical_prices(self, ticker: str, lookback_days: int, token: Optional[str] = None) -> List[PriceDataPoint]:
        """
        Fetches historical daily prices and falls back to the backend chart API when Cosmos history is sparse.
        """
        ticker = ticker.upper()
        cosmos_prices: List[PriceDataPoint] = []

        if self.cosmos_uri and self.cosmos_key:
            start_date = (datetime.now(UTC) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
            query = """
                SELECT c.date AS timestamp, c.close, c.high, c.low, c.open, c.volume
                FROM c
                WHERE c.ticker = @ticker AND c.date >= @start_date
                ORDER BY c.date ASC
            """
            parameters = [
                {"name": "@ticker", "value": ticker},
                {"name": "@start_date", "value": start_date},
            ]

            try:
                client = await self.get_cosmos_client()
                database = client.get_database_client(self.cosmos_db_id)
                container = database.get_container_client(settings.COSMOS_PSE_CONTAINER)

                items = container.query_items(
                    query=query,
                    parameters=parameters,
                    partition_key=ticker,
                )

                async for item in items:
                    if isinstance(item, dict):
                        price_point = self._coerce_price_point(item)
                        if price_point is not None:
                            cosmos_prices.append(price_point)
            except Exception as e:
                logger.warning(
                    "Cosmos history lookup failed, trying backend chart data",
                    exc_info=True,
                    extra={"extra_info": {"error": str(e), "ticker": ticker}},
                )

        if len(cosmos_prices) >= 14:
            return cosmos_prices

        try:
            chart_prices = await self._fetch_backend_chart_prices(ticker, lookback_days, token)
            if chart_prices:
                logger.info(
                    "Using backend chart history for trading evaluation",
                    extra={"extra_info": {"ticker": ticker, "points": len(chart_prices)}},
                )
                return chart_prices
        except Exception as e:
            logger.warning(
                "Backend chart lookup failed",
                exc_info=True,
                extra={"extra_info": {"error": str(e), "ticker": ticker}},
            )

        if cosmos_prices:
            logger.warning(
                "Returning sparse Cosmos history because no richer fallback was available",
                extra={"extra_info": {"ticker": ticker, "points": len(cosmos_prices)}},
            )
            return cosmos_prices

        error_msg = f"No price data found for {ticker}."
        logger.error(error_msg, extra={"extra_info": {"ticker": ticker}})
        raise ValueError(error_msg)

    async def fetch_portfolio_state(self, user_id: str, token: Optional[str] = None) -> PortfolioState:
        """
        Fetches the user's current portfolio state from the backend API and maps it to engine schema.
        """
        url = f"{self.backend_url}/portfolio/{user_id}"
        
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        
        try:
            client = await self.get_http_client()
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            backend_data = response.json()
            
            # Map backend response (camelCase, list-based holdings) to engine schema (snake_case, dict-based positions)
            from app.models.schemas import PortfolioPosition
            
            positions = {}
            for holding in backend_data.get("holdings", []):
                ticker = holding["ticker"]
                positions[ticker] = PortfolioPosition(
                    ticker=ticker,
                    quantity=float(holding["shares"]),
                    average_price=holding["avgPrice"],
                    current_value=holding.get("marketValue", 0.0)
                )
            
            # Use liquidCash from backend instead of hardcoded default
            cash_balance = backend_data.get("liquidCash", settings.DEFAULT_CASH_BALANCE)
            total_value = backend_data.get("totalPortfolioValue", cash_balance)
            
            return PortfolioState(
                user_id=user_id,
                cash_balance=cash_balance,
                positions=positions,
                total_value=total_value
            )
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch portfolio state for user {user_id}", exc_info=True, extra={"extra_info": {"error": str(e)}})
            raise

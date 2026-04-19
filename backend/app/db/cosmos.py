from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class CosmosDB:
    """Wraps container references for the portfolio/data/map domain.

    Accepts a *shared* async ``CosmosClient`` that is owned by the application
    lifespan so we get a single connection pool and deterministic cleanup.

    Use ``await CosmosDB.create(client)`` instead of the constructor directly,
    because container initialisation requires async I/O.
    """

    def __init__(self, client: CosmosClient):
        self.client = client

    @classmethod
    async def create(cls, client: CosmosClient) -> "CosmosDB":
        """Async factory — call during lifespan startup."""
        instance = cls(client)
        instance.database = client.get_database_client(settings.COSMOS_DATABASE_ID)

        # Ensure portfolio container exists
        try:
            instance.container = await instance.database.create_container_if_not_exists(
                id=settings.COSMOS_PORTFOLIO_CONTAINER,
                partition_key=PartitionKey(path="/userId")
            )
        except Exception as e:
            logger.error(f"Failed to create or get portfolio container: {e}")
            instance.container = instance.database.get_container_client(settings.COSMOS_PORTFOLIO_CONTAINER)
            
        # Get clients for read-only scraped data containers
        try:
            instance.macro_container = instance.database.get_container_client(settings.COSMOS_MACRO_CONTAINER)
            instance.news_container = instance.database.get_container_client(settings.COSMOS_NEWS_CONTAINER)
            instance.pse_container = instance.database.get_container_client(settings.COSMOS_PSE_CONTAINER)
        except Exception as e:
            logger.error(f"Failed to get read-only data containers: {e}")

        try:
            instance.map_assets_container = await instance.database.create_container_if_not_exists(
                id=settings.COSMOS_MAP_ASSETS_CONTAINER,
                partition_key=PartitionKey(path="/region"),
            )
            instance.map_zones_container = await instance.database.create_container_if_not_exists(
                id=settings.COSMOS_MAP_ZONES_CONTAINER,
                partition_key=PartitionKey(path="/region"),
            )
            instance.map_connections_container = await instance.database.create_container_if_not_exists(
                id=settings.COSMOS_MAP_CONNECTIONS_CONTAINER,
                partition_key=PartitionKey(path="/region"),
            )
            instance.map_tracks_container = await instance.database.create_container_if_not_exists(
                id=settings.COSMOS_MAP_TRACKS_CONTAINER,
                partition_key=PartitionKey(path="/assetId"),
            )
            instance.map_events_container = await instance.database.create_container_if_not_exists(
                id=settings.COSMOS_MAP_EVENTS_CONTAINER,
                partition_key=PartitionKey(path="/eventDate"),
            )
        except Exception as e:
            logger.error(f"Failed to create or get map containers: {e}")
            instance.map_assets_container = instance.database.get_container_client(settings.COSMOS_MAP_ASSETS_CONTAINER)
            instance.map_zones_container = instance.database.get_container_client(settings.COSMOS_MAP_ZONES_CONTAINER)
            instance.map_connections_container = instance.database.get_container_client(settings.COSMOS_MAP_CONNECTIONS_CONTAINER)
            instance.map_tracks_container = instance.database.get_container_client(settings.COSMOS_MAP_TRACKS_CONTAINER)
            instance.map_events_container = instance.database.get_container_client(settings.COSMOS_MAP_EVENTS_CONTAINER)

        return instance

    @staticmethod
    async def _query_items(container, query: str, parameters: list[dict], *, default: list | None = None):
        try:
            return [
                item async for item in container.query_items(
                    query=query,
                    parameters=parameters,

                )
            ]
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Cosmos query failed: {e}")
            return [] if default is None else default

    async def get_portfolio(self, user_id: str):
        try:
            query = "SELECT * FROM c WHERE c.userId = @userId"
            parameters = [{"name": "@userId", "value": user_id}]
            items = [
                item async for item in self.container.query_items(
                    query=query,
                    parameters=parameters,
                )
            ]
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching portfolio: {e}")
            return []

    async def get_holding(self, user_id: str, ticker: str):
        item_id = f"{user_id}_{ticker}"
        try:
            return await self.container.read_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            return None
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching holding: {e}")
            return None

    async def upsert_holding(self, user_id: str, ticker: str, shares: float, avg_price: float):
        # We use ticker as ID for simplicity within the user's scope if we want, 
        # but better to have a unique ID and query by ticker/userId
        item_id = f"{user_id}_{ticker}"
        item = {
            "id": item_id,
            "userId": user_id,
            "type": "holding",
            "ticker": ticker.upper(),
            "shares": shares,
            "avgPrice": avg_price,
            "lastUpdated": "" # set in service
        }
        try:
            return await self.container.upsert_item(item)
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error upserting holding: {e}")
            raise

    async def delete_holding(self, user_id: str, ticker: str):
        item_id = f"{user_id}_{ticker}"
        try:
            await self.container.delete_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            pass
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error deleting holding: {e}")
            raise

    async def get_cash(self, user_id: str):
        item_id = f"{user_id}_cash"
        try:
            return await self.container.read_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            return None
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching cash: {e}")
            return None

    async def upsert_cash(self, user_id: str, amount: float):
        item_id = f"{user_id}_cash"
        item = {
            "id": item_id,
            "userId": user_id,
            "type": "cash",
            "amount": amount
        }
        try:
            return await self.container.upsert_item(item)
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error upserting cash: {e}")
            raise

    async def delete_cash(self, user_id: str):
        item_id = f"{user_id}_cash"
        try:
            await self.container.delete_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            pass
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error deleting cash: {e}")
            raise

    async def get_latest_macro_data(self, indicator: str = None, limit: int = 50):
        query = "SELECT * FROM c"
        parameters = []
        if indicator:
            query += " WHERE c.indicator = @indicator"
            parameters.append({"name": "@indicator", "value": indicator})
        query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})
        
        try:
            items = [
                item async for item in self.macro_container.query_items(
                    query=query,
                    parameters=parameters,
                )
            ]
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching macro data: {e}")
            return []

    async def get_latest_news_data(self, ticker: str = None, limit: int = 50):
        query = "SELECT * FROM c"
        parameters = []
        if ticker:
            query += " WHERE c.ticker = @ticker"
            parameters.append({"name": "@ticker", "value": ticker.upper()})
        query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})
        
        try:
            items = [
                item async for item in self.news_container.query_items(
                    query=query,
                    parameters=parameters,
                )
            ]
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching news data: {e}")
            return []

    async def get_latest_pse_data(self, ticker: str = None, limit: int = 50):
        query = "SELECT * FROM c"
        parameters = []
        if ticker:
            query += " WHERE c.ticker = @ticker"
            parameters.append({"name": "@ticker", "value": ticker.upper()})
        query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})
        
        try:
            items = [
                item async for item in self.pse_container.query_items(
                    query=query,
                    parameters=parameters,
                )
            ]
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching pse data: {e}")
            return []

    async def list_map_assets(self):
        return await self._query_items(
            self.map_assets_container,
            "SELECT * FROM c",
            [],
        )

    async def list_map_zones(self):
        return await self._query_items(
            self.map_zones_container,
            "SELECT * FROM c",
            [],
        )

    async def list_map_connections(self):
        return await self._query_items(
            self.map_connections_container,
            "SELECT * FROM c",
            [],
        )

    async def list_map_tracks(self):
        return await self._query_items(
            self.map_tracks_container,
            "SELECT * FROM c",
            [],
        )

    async def list_map_events(self, limit: int = 250):
        return await self._query_items(
            self.map_events_container,
            "SELECT * FROM c",
            [],
        )

_instance: CosmosDB | None = None


async def init_db(client: CosmosClient) -> CosmosDB:
    """Called once during lifespan startup to wire the shared CosmosClient."""
    global _instance
    _instance = await CosmosDB.create(client)
    logger.info("CosmosDB data layer initialized (shared async client)")
    return _instance


def close_db() -> None:
    """Called during lifespan shutdown. Clears the module reference
    (the CosmosClient itself is closed by the lifespan owner)."""
    global _instance
    _instance = None
    logger.info("CosmosDB data layer reference cleared")


def get_db() -> CosmosDB:
    """FastAPI-compatible dependency that returns the lifespan-managed instance."""
    if _instance is None:
        raise RuntimeError(
            "CosmosDB is not initialised – the application lifespan has not run yet."
        )
    return _instance

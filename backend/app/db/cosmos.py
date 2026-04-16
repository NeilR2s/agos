from azure.cosmos import CosmosClient, PartitionKey, exceptions
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class CosmosDB:
    def __init__(self):
        self.client = CosmosClient(settings.COSMOS_URI, settings.COSMOS_PRIMARY_KEY)
        self.database = self.client.get_database_client(settings.COSMOS_DATABASE_ID)
        # Ensure portfolio container exists
        try:
            self.container = self.database.create_container_if_not_exists(
                id=settings.COSMOS_PORTFOLIO_CONTAINER,
                partition_key=PartitionKey(path="/userId")
            )
        except Exception as e:
            logger.error(f"Failed to create or get portfolio container: {e}")
            self.container = self.database.get_container_client(settings.COSMOS_PORTFOLIO_CONTAINER)
            
        # Get clients for read-only scraped data containers
        try:
            self.macro_container = self.database.get_container_client(settings.COSMOS_MACRO_CONTAINER)
            self.news_container = self.database.get_container_client(settings.COSMOS_NEWS_CONTAINER)
            self.pse_container = self.database.get_container_client(settings.COSMOS_PSE_CONTAINER)
        except Exception as e:
            logger.error(f"Failed to get read-only data containers: {e}")

    def get_portfolio(self, user_id: str):
        try:
            query = "SELECT * FROM c WHERE c.userId = @userId"
            parameters = [{"name": "@userId", "value": user_id}]
            items = list(self.container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching portfolio: {e}")
            return []

    def get_holding(self, user_id: str, ticker: str):
        item_id = f"{user_id}_{ticker}"
        try:
            return self.container.read_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            return None
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching holding: {e}")
            return None

    def upsert_holding(self, user_id: str, ticker: str, shares: float, avg_price: float):
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
            return self.container.upsert_item(item)
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error upserting holding: {e}")
            raise

    def delete_holding(self, user_id: str, ticker: str):
        item_id = f"{user_id}_{ticker}"
        try:
            self.container.delete_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            pass
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error deleting holding: {e}")
            raise

    def get_cash(self, user_id: str):
        item_id = f"{user_id}_cash"
        try:
            return self.container.read_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            return None
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching cash: {e}")
            return None

    def upsert_cash(self, user_id: str, amount: float):
        item_id = f"{user_id}_cash"
        item = {
            "id": item_id,
            "userId": user_id,
            "type": "cash",
            "amount": amount
        }
        try:
            return self.container.upsert_item(item)
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error upserting cash: {e}")
            raise

    def delete_cash(self, user_id: str):
        item_id = f"{user_id}_cash"
        try:
            self.container.delete_item(item=item_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            pass
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error deleting cash: {e}")
            raise

    def get_latest_macro_data(self, indicator: str = None, limit: int = 50):
        query = "SELECT * FROM c"
        parameters = []
        if indicator:
            query += " WHERE c.indicator = @indicator"
            parameters.append({"name": "@indicator", "value": indicator})
        query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})
        
        try:
            items = list(self.macro_container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching macro data: {e}")
            return []

    def get_latest_news_data(self, ticker: str = None, limit: int = 50):
        query = "SELECT * FROM c"
        parameters = []
        if ticker:
            query += " WHERE c.ticker = @ticker"
            parameters.append({"name": "@ticker", "value": ticker.upper()})
        query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})
        
        try:
            items = list(self.news_container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching news data: {e}")
            return []

    def get_latest_pse_data(self, ticker: str = None, limit: int = 50):
        query = "SELECT * FROM c"
        parameters = []
        if ticker:
            query += " WHERE c.ticker = @ticker"
            parameters.append({"name": "@ticker", "value": ticker.upper()})
        query += " ORDER BY c.date DESC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})
        
        try:
            items = list(self.pse_container.query_items(
                query=query,
                parameters=parameters,
                enable_cross_partition_query=True
            ))
            return items
        except exceptions.CosmosHttpResponseError as e:
            logger.error(f"Error fetching pse data: {e}")
            return []

db = None

def get_db():
    global db
    if db is None:
        db = CosmosDB()
    return db

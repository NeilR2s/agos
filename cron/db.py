from azure.cosmos import PartitionKey
from azure.cosmos.aio import CosmosClient

from config import settings

# Cosmos DB Configuration
COSMOS_ENDPOINT = settings.COSMOS_URI
COSMOS_KEY = settings.COSMOS_PRIMARY_KEY
COSMOS_DB_ID = settings.COSMOS_DATABASE_ID

# Container Configurations
CONTAINERS = {
    settings.COSMOS_PSE_CONTAINER: "/ticker",
    settings.COSMOS_MACRO_CONTAINER: "/indicator",
    settings.COSMOS_NEWS_CONTAINER: "/ticker",
}


async def init_db():
    """Initializes the Cosmos DB database and containers."""
    async with CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY) as client:
        # Create database
        db = await client.create_database_if_not_exists(id=COSMOS_DB_ID)

        # Create containers
        for container_name, partition_key in CONTAINERS.items():
            await db.create_container_if_not_exists(
                id=container_name, partition_key=PartitionKey(path=partition_key)
            )


def get_cosmos_client():
    """Returns an async CosmosClient instance."""
    return CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)

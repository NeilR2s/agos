import asyncio
import pandas as pd
from db import get_cosmos_client, COSMOS_DB_ID
from config import settings


async def verify():
    async with get_cosmos_client() as client:
        db = client.get_database_client(COSMOS_DB_ID)

        print("--- Container Counts ---")
        for container_name in [settings.COSMOS_PSE_CONTAINER, settings.COSMOS_MACRO_CONTAINER, settings.COSMOS_NEWS_CONTAINER]:
            container = db.get_container_client(container_name)
            query = "SELECT VALUE COUNT(1) FROM c"
            items = [
                item
                async for item in container.query_items(query, enable_cross_partition_query=True)
            ]
            print(f"{container_name}: {items[0]}")

        print("\n--- PSA Macro Data (GDP/Inflation) ---")
        container = db.get_container_client(settings.COSMOS_MACRO_CONTAINER)
        psa_query = "SELECT c.date, c.category, c.indicator, c.value, c.scraped_at FROM c WHERE c.source='PSA' OFFSET 0 LIMIT 10"
        items = [
            item
            async for item in container.query_items(psa_query, enable_cross_partition_query=True)
        ]
        df_psa = pd.DataFrame(items)
        print(df_psa)

        print("\n--- BSP Macro Data (Key Rates) ---")
        bsp_query = "SELECT c.date, c.indicator, c.value, c.scraped_at FROM c WHERE c.source='BSP' OFFSET 0 LIMIT 5"
        items = [
            item
            async for item in container.query_items(bsp_query, enable_cross_partition_query=True)
        ]
        df_bsp = pd.DataFrame(items)
        print(df_bsp)


if __name__ == "__main__":
    asyncio.run(verify())

import asyncio

from bsp_scraper import BSPScraper
from db import get_cosmos_client, init_db, COSMOS_DB_ID
from logger import setup_logger
from news_scraper import NewsScraper
from psa_scraper import PSAScraper
from pse_scraper import PSEScraper
from config import settings
from seed_map_reference_data import seed_map_reference_data

logger = setup_logger("Pipeline")


async def run_pipeline():
    """
    Orchestrates the concurrent execution of all scrapers using TaskGroup.
    """
    logger.info("Initializing database...")
    await init_db()

    logger.info("Starting concurrent scraping pipeline...")
    max_pse_concurrency = settings.PSE_MAX_CONCURRENCY

    async with get_cosmos_client() as client:
        db_client = client.get_database_client(COSMOS_DB_ID)
        await seed_map_reference_data(db_client, settings)

        scrapers = [
            PSAScraper(db_client),
            BSPScraper(db_client),
            PSEScraper(db_client, max_concurrency=max_pse_concurrency),
            NewsScraper(db_client),
        ]

        try:
            async with asyncio.TaskGroup() as tg:
                for scraper in scrapers:
                    tg.create_task(scraper.scrape_and_process())
        except ExceptionGroup as eg:
            for e in eg.exceptions:
                logger.error(f"Scraper failed: {e}")
        except Exception as e:
            logger.error(f"Pipeline encountered an error: {e}")

    logger.info("Pipeline completed.")


if __name__ == "__main__":
    asyncio.run(run_pipeline())

import asyncio
import os

from dotenv import load_dotenv

from bsp_scraper import BSPScraper
from db import AsyncSessionLocal, init_db
from logger import setup_logger
from psa_scraper import PSAScraper
from pse_scraper import PSEScraper

load_dotenv()
logger = setup_logger("Pipeline")

async def run_pipeline():
    """
    Orchestrates the concurrent execution of all scrapers using TaskGroup.
    """
    logger.info("Initializing database...")
    await init_db()

    logger.info("Starting concurrent scraping pipeline...")
    max_pse_concurrency = int(os.getenv("PSE_MAX_CONCURRENCY", "20"))

    async with AsyncSessionLocal() as session:
        scrapers = [
            PSAScraper(session),
            BSPScraper(session),
            PSEScraper(session, max_concurrency=max_pse_concurrency)
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

import asyncio
import json
import logging
import os
import random
import sys
from datetime import datetime

# Ensure the script can find pse_scraper.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from curl_cffi import requests
from pse_scraper import StockApi

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def save_jsonl(data, path):
    """Saves the data list of dictionaries into a JSONLines format."""
    with open(path, "w") as f:
        for item in data:
            f.write(json.dumps(item) + "\n")


async def fetch_and_process():
    # Use max_concurrency=10 to be respectful of the server
    api = StockApi(max_concurrency=10, timeout=60)
    async with requests.AsyncSession() as session:
        logger.info("Fetching list of active companies from PSE Edge...")
        companies = await api.get_companies(session)
        logger.info(f"Found {len(companies)} companies. Fetching historical chart data...")

        async def get_normalized_data(c):
            try:
                details = await api.get_company_details(
                    session,
                    cmpy_id=c["companyId"],
                    sec_id=c["securityId"],
                    ticker=c["stockTicker"],
                    name=c["companyName"],
                )
                chart_data = details.get("chartData", [])

                # We need a reasonable amount of data points to train/val
                if not chart_data or len(chart_data) < 50:
                    return None

                def parse_date(date_str):
                    return datetime.strptime(date_str, "%b %d, %Y %H:%M:%S")

                # Ensure data is sorted chronologically
                chart_data.sort(key=lambda x: parse_date(x["CHART_DATE"]))

                # Extract first timestamp
                start_date = parse_date(chart_data[0]["CHART_DATE"]).strftime("%Y-%m-%d %H:%M:%S")

                # Extract CLOSE prices
                target = [pt["CLOSE"] for pt in chart_data if pt.get("CLOSE") is not None]

                if len(target) < 50:
                    return None

                return {
                    "start": start_date,
                    "target": target,
                    "item_id": c["stockTicker"],
                }
            except Exception as e:
                logger.warning(f"Error processing {c['stockTicker']}: {e}")
                return None

        # Gather all stock histories concurrently
        tasks = [get_normalized_data(c) for c in companies]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        valid_data = []
        for res in results:
            if isinstance(res, dict):
                valid_data.append(res)
            elif isinstance(res, Exception):
                logger.warning(f"Task generated an exception: {res}")

        logger.info(f"Successfully normalized data for {len(valid_data)} stocks.")
        return valid_data


def main():
    data = asyncio.run(fetch_and_process())

    if not data:
        logger.error("No valid data fetched. Exiting.")
        return

    # Shuffle the list to randomize train/val split
    random.seed(42)
    random.shuffle(data)

    # Split 80% train, 20% validation
    split_idx = int(len(data) * 0.8)
    train_data = data[:split_idx]
    val_data = data[split_idx:]

    data_dir = "./data"
    os.makedirs(data_dir, exist_ok=True)

    train_path = os.path.join(data_dir, "train.jsonl")
    val_path = os.path.join(data_dir, "val.jsonl")

    save_jsonl(train_data, train_path)
    save_jsonl(val_data, val_path)

    logger.info("Data split complete.")
    logger.info(f"Train data ({len(train_data)} series) saved to {train_path}")
    logger.info(f"Val data ({len(val_data)} series) saved to {val_path}")


if __name__ == "__main__":
    main()

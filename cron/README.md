# cron

The `cron` package is an async ingestion pipeline for market data, macro indicators, and news sentiment.

## Pipeline Entrypoint

`main.py` builds the scraper registry and executes them concurrently using `asyncio.TaskGroup`.

## Scrapers

- `pse_scraper.py`: Daily stock snapshots for listed companies.
- `psa_scraper.py`: Macro indicators including GDP, inflation, and trade balance.
- `bsp_scraper.py`: Key policy and exchange rates.
- `news_scraper.py`: Ticker-linked sentiment analysis using Tavily and Gemini.

## Cosmos DB Layout

Data is partitioned to optimize for ticker-based and date-based lookups:
- `pse_stock_data`: Partitioned by `/ticker`.
- `macro_data`: Partitioned by `/indicator`.
- `news_sentiment_data`: Partitioned by `/ticker`.
- `map_*`: Various containers for geospatial assets and events.

## Configuration

`config.py` is the source of truth for environment variables. Ensure the following are set in `.env`:
- `COSMOS_URI` and `COSMOS_PRIMARY_KEY`
- `TAVILY_API_KEY` and `GEMINI_API_KEY`
- `GEOAPIFY_KEY` (for mapping services)

## Verification

```bash
# Linting
ruff check .

# Unit tests
pytest tests

# Data check
python verify_results.py
```

`verify_results.py` prints record counts and sample data from Cosmos to confirm ingestion success.

## Notes

- The pipeline seeds map reference data (assets, zones, connections) before running scrapers.
- Use `requirements.txt` for local environment setup.


# cron

`cron/` is the async ingestion pipeline for external market, macro, and news inputs.

## Pipeline entrypoint

- `main.py` initializes Cosmos DB, builds the scraper list, and runs them concurrently with `asyncio.TaskGroup`.
- `base_scraper.py` provides retries, concurrency control, hashing, and idempotent upserts.

## Scrapers

- `pse_scraper.py` writes daily stock snapshots for listed companies and PSE index summary entries.
- `psa_scraper.py` writes GDP, core inflation, unemployment, and trade balance records.
- `bsp_scraper.py` writes key rates and exchange rates.
- `news_scraper.py` uses Tavily plus Gemini structured output to write company-linked news sentiment records.

## Cosmos layout

| Container | Partition key | Content |
| --- | --- | --- |
| `pse_stock_data` | `/ticker` | Daily stock data for listed companies |
| `macro_data` | `/indicator` | PSA, BSP, and PSE macro or index records |
| `news_sentiment_data` | `/ticker` | News articles with sentiment and ticker linkage |
| `map_assets` | `/region` | Seeded operational asset reference data |
| `map_zones` | `/region` | Seeded monitoring and facility polygons |
| `map_connections` | `/region` | Seeded network and supply connections |
| `map_tracks` | `/assetId` | Seeded movement tracks for the map timeline |
| `map_events` | `/eventDate` | Live or normalized geospatial events |

## Configuration

- `config.py` is the source of truth for environment names.
- Core values are `COSMOS_URI`, `COSMOS_PRIMARY_KEY`, `COSMOS_DATABASE_ID`, the market/news container names, the map container names, `TAVILY_API_KEY`, `GEMINI_API_KEY`, and `PSE_MAX_CONCURRENCY`.
- PSA, PSE, and BSP source endpoints are also env-driven.

## Local run

Populate `.env` using `config.py` as the reference. The checked-in `.env.example` is incomplete.

```bash
pip install -r requirements.txt
python main.py
```

## Verification

```bash
ruff check .
pytest tests
python verify_results.py
```

`verify_results.py` prints container counts and sample PSA and BSP records from Cosmos.
The pipeline also idempotently seeds map reference data before scraper execution.

## Current caveats

- Use `requirements.txt` as the practical dependency source. `pyproject.toml` still lists older SQLite and SQLAlchemy dependencies that the live pipeline does not use.
- `.env.example` is incomplete and contains older field names. `config.py` is the safer reference when setting up a new environment.
- Test coverage currently stops at shared scraper behavior and Cosmos initialization. Source-specific parsing is not covered directly.

# AGOS Cron Pipeline

Concurrent, asynchronous data scraping pipeline for Philippine macroeconomic and financial market data.

## Architecture
- **Concurrency**: Built heavily on `asyncio` to fetch from multiple sources simultaneously.
- **Network Requests**: Utilizes `curl_cffi` for TLS fingerprint impersonation (e.g., Chrome) to reliably bypass anti-bot mechanisms.
- **Resilience**: `tenacity` handles exponential backoff retries for connection and timeout errors.
- **Storage**: Uses `sqlalchemy` (async) with SQLite (`aiosqlite`). Upserts rely on SHA-256 composite hashes (date + entity + metric) as primary keys to ensure idempotency and prevent duplicate records.

## Data Sources
- **BSP (Bangko Sentral ng Pilipinas)**: Extracts Key Rates via XML/OData endpoints.
- **PDS (Philippine Dealing System)**: Scrapes BVAL Rates and Fixed Income Market Volume from HTML tables.
- **PSA (Philippine Statistics Authority)**: Fetches GDP and Core Inflation data via the PXWeb API (CSV payload).
- **PSE (Philippine Stock Exchange)**: Scrapes Equities data (OHLC, volume, market cap) via a combination of undocumented internal APIs and HTML parsing.

## Setup & Execution

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Activate Venv**
    ```
    source cron_venv/bin/activate
    ```

3. **Run Pipeline**
   ```bash
   python main.py
   ```
   *Note: This will automatically initialize the `trading_data.db` SQLite database if it does not exist.*

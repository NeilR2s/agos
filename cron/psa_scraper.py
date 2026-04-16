import io

import pandas as pd

from base_scraper import BaseScraper
from config import settings


class PSAScraper(BaseScraper):
    """
    Scraper for Philippine Statistics Authority (PSA) OpenStat data.
    """

    GDP_SOURCE = settings.PSA_GDP_SOURCE
    INF_SOURCE = settings.PSA_INFLATION_SOURCE
    LFS_SOURCE = settings.PSA_LABOR_SOURCE
    TRADE_SOURCE = settings.PSA_TRADE_SOURCE

    async def fetch_px_metadata(self, session, source):
        res = await self.fetch(session, "GET", source)
        return res.json()

    async def fetch_px_csv(self, session, source, payload):
        res = await self.fetch(session, "POST", source, json=payload)
        df = pd.read_csv(io.BytesIO(res.content))
        return df.loc[:, ~df.columns.str.contains("^Unnamed")]

    async def scrape_gdp(self, session):
        self.logger.info("Scraping GDP...")
        try:
            metadata = await self.fetch_px_metadata(session, self.GDP_SOURCE)
            year_var = next(v for v in metadata["variables"] if v["code"] == "Year")
            latest_year_idx = year_var["values"][-1]

            payload = {
                "query": [
                    {"code": "Industry", "selection": {"filter": "item", "values": ["0"]}},
                    {"code": "Year", "selection": {"filter": "item", "values": [latest_year_idx]}},
                ],
                "response": {"format": "csv"},
            }

            df = await self.fetch_px_csv(session, self.GDP_SOURCE, payload)
            df = df.replace("..", 0)

            if df.empty:
                return

            industry = df.iloc[0, 0]
            for col in df.columns[1:]:
                parts = col.split()
                date_str = f"{parts[0]} {parts[1]}" if len(parts) >= 2 else col
                val = pd.to_numeric(df[col].iloc[0], errors="coerce")

                await self.upsert(
                    settings.COSMOS_MACRO_CONTAINER,
                    {
                        "hash": self.generate_hash(date_str, "PSA", "GDP", industry),
                        "date": date_str,
                        "source": "PSA",
                        "category": "GDP",
                        "indicator": industry,
                        "value": float(val) if not pd.isna(val) else 0.0,
                        "frequency": "Quarterly",
                        "description": "Gross Domestic Product from PSA OpenStat",
                    },
                )
        except Exception as e:
            self.logger.error(f"GDP Scrape failed: {e}")

    async def scrape_inflation(self, session):
        self.logger.info("Scraping Inflation...")
        try:
            metadata = await self.fetch_px_metadata(session, self.INF_SOURCE)
            year_var = next(v for v in metadata["variables"] if v["code"] == "Year")
            latest_year_idx = year_var["values"][-1]

            payload = {
                "query": [
                    {"code": "Geolocation", "selection": {"filter": "item", "values": ["0"]}},
                    {
                        "code": "Commodity Description",
                        "selection": {"filter": "item", "values": ["0"]},
                    },
                    {"code": "Year", "selection": {"filter": "item", "values": [latest_year_idx]}},
                    {
                        "code": "Period",
                        "selection": {"filter": "item", "values": [str(i) for i in range(12)]},
                    },
                ],
                "response": {"format": "csv"},
            }

            df = await self.fetch_px_csv(session, self.INF_SOURCE, payload)
            df = df.replace("..", 0)

            for col in df.columns:
                if any(x in col for x in ["Geolocation", "Commodity", "Ave"]):
                    continue

                val = pd.to_numeric(df[col].iloc[0], errors="coerce")
                if pd.isna(val):
                    continue

                date_str = col.strip()
                indicator = "Core Inflation (All Items)"

                await self.upsert(
                    settings.COSMOS_MACRO_CONTAINER,
                    {
                        "hash": self.generate_hash(date_str, "PSA", "Inflation", indicator),
                        "date": date_str,
                        "source": "PSA",
                        "category": "Inflation",
                        "indicator": indicator,
                        "value": float(val),
                        "frequency": "Monthly",
                        "description": (
                            "Core Inflation (excluding volatile food and energy items) from PSA"
                        ),
                    },
                )
        except Exception as e:
            self.logger.error(f"Inflation Scrape failed: {e}")

    async def scrape_unemployment(self, session):
        self.logger.info("Scraping Unemployment Rate...")
        try:
            metadata = await self.fetch_px_metadata(session, self.LFS_SOURCE)
            year_var = next(v for v in metadata["variables"] if v["code"] == "Year")
            latest_year_idx = year_var["values"][-1]

            payload = {
                "query": [
                    {"code": "Rates", "selection": {"filter": "item", "values": ["2"]}},
                    {"code": "Sex", "selection": {"filter": "item", "values": ["0"]}},
                    {"code": "Year", "selection": {"filter": "item", "values": [latest_year_idx]}},
                    {
                        "code": "Month",
                        "selection": {"filter": "item", "values": [str(i) for i in range(12)]},
                    },
                ],
                "response": {"format": "csv"},
            }

            df = await self.fetch_px_csv(session, self.LFS_SOURCE, payload)
            df = df.replace("..", 0)

            # Find the value column (usually contains "Rate")
            val_cols = [c for c in df.columns if "Rate" in c]
            if not val_cols:
                self.logger.warning("Could not find Unemployment Rate column.")
                return

            val_col = val_cols[0]
            for _, row in df.iterrows():
                val = pd.to_numeric(row[val_col], errors="coerce")
                if pd.isna(val) or val == 0:
                    continue

                date_str = f"{row['Month']} {row['Year']}"
                indicator = "Unemployment Rate"

                await self.upsert(
                    settings.COSMOS_MACRO_CONTAINER,
                    {
                        "hash": self.generate_hash(date_str, "PSA", "Labor", indicator),
                        "date": date_str,
                        "source": "PSA",
                        "category": "Labor",
                        "indicator": indicator,
                        "value": float(val),
                        "frequency": "Monthly",
                        "description": "Unemployment Rate from PSA Labor Force Survey",
                    },
                )
        except Exception as e:
            self.logger.error(f"Unemployment Scrape failed: {e}")

    async def scrape_trade(self, session):
        self.logger.info("Scraping Trade Balance...")
        try:
            metadata = await self.fetch_px_metadata(session, self.TRADE_SOURCE)
            year_var = next(v for v in metadata["variables"] if v["code"] == "Year")
            latest_year_idx = year_var["values"][-1]

            payload = {
                "query": [
                    {"code": "Variables", "selection": {"filter": "item", "values": ["2"]}},
                    {"code": "Year", "selection": {"filter": "item", "values": [latest_year_idx]}},
                    {
                        "code": "Month",
                        "selection": {"filter": "item", "values": [str(i) for i in range(12)]},
                    },
                ],
                "response": {"format": "csv"},
            }

            df = await self.fetch_px_csv(session, self.TRADE_SOURCE, payload)
            df = df.replace("..", 0)

            # Find the value column (usually contains "Balance")
            val_cols = [c for c in df.columns if "Balance" in c]
            if not val_cols:
                self.logger.warning("Could not find Balance of Trade column.")
                return

            val_col = val_cols[0]
            for _, row in df.iterrows():
                val = pd.to_numeric(row[val_col], errors="coerce")
                if pd.isna(val) or val == 0:
                    continue

                date_str = f"{row['Month']} {row['Year']}"
                indicator = "Balance of Trade (BOT-G)"

                await self.upsert(
                    settings.COSMOS_MACRO_CONTAINER,
                    {
                        "hash": self.generate_hash(date_str, "PSA", "Trade", indicator),
                        "date": date_str,
                        "source": "PSA",
                        "category": "Trade",
                        "indicator": indicator,
                        "value": float(val),
                        "frequency": "Monthly",
                        "description": "Balance of Trade (Goods) from PSA",
                    },
                )
        except Exception as e:
            self.logger.error(f"Trade Scrape failed: {e}")

    async def scrape_and_process(self):
        async with self.get_http_session() as session:
            await self.scrape_gdp(session)
            await self.scrape_inflation(session)
            await self.scrape_unemployment(session)
            await self.scrape_trade(session)
            return True

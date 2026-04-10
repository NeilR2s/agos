import io

import pandas as pd

from base_scraper import BaseScraper
from db import MacroData


class PSAScraper(BaseScraper):
    """
    Scraper for Philippine Statistics Authority (PSA) OpenStat data.
    """

    GDP_URL = "https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/2B/NA/QT/1SUM/0132B5CPCQ2.px"
    INF_URL = "https://openstat.psa.gov.ph:443/PXWeb/api/v1/en/DB/2M/PI/CPI/2018/0012M4ACP10.px"

    async def fetch_px_metadata(self, session, url):
        res = await self.fetch(session, "GET", url)
        return res.json()

    async def fetch_px_csv(self, session, url, payload):
        res = await self.fetch(session, "POST", url, json=payload)
        df = pd.read_csv(io.BytesIO(res.content))
        return df.loc[:, ~df.columns.str.contains("^Unnamed")]

    async def scrape_gdp(self, session):
        self.logger.info("Scraping GDP...")
        try:
            metadata = await self.fetch_px_metadata(session, self.GDP_URL)
            year_var = next(v for v in metadata["variables"] if v["code"] == "Year")
            latest_year_idx = year_var["values"][-1]

            payload = {
                "query": [
                    {"code": "Industry", "selection": {"filter": "item", "values": ["0"]}},
                    {"code": "Year", "selection": {"filter": "item", "values": [latest_year_idx]}},
                ],
                "response": {"format": "csv"},
            }

            df = await self.fetch_px_csv(session, self.GDP_URL, payload)
            df = df.replace("..", 0)

            if df.empty:
                return

            industry = df.iloc[0, 0]
            for col in df.columns[1:]:
                parts = col.split()
                date_str = f"{parts[0]} {parts[1]}" if len(parts) >= 2 else col
                val = pd.to_numeric(df[col].iloc[0], errors="coerce")

                await self.upsert(
                    MacroData,
                    {
                        "hash": self.generate_hash(date_str, "PSA", "GDP", industry),
                        "date": date_str,
                        "source": "PSA",
                        "category": "GDP",
                        "indicator": industry,
                        "value": float(val) if not pd.isna(val) else 0.0,
                    },
                )
        except Exception as e:
            self.logger.error(f"GDP Scrape failed: {e}")

    async def scrape_inflation(self, session):
        self.logger.info("Scraping Inflation...")
        try:
            metadata = await self.fetch_px_metadata(session, self.INF_URL)
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

            df = await self.fetch_px_csv(session, self.INF_URL, payload)
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
                    MacroData,
                    {
                        "hash": self.generate_hash(date_str, "PSA", "Inflation", indicator),
                        "date": date_str,
                        "source": "PSA",
                        "category": "Inflation",
                        "indicator": indicator,
                        "value": float(val),
                    },
                )
        except Exception as e:
            self.logger.error(f"Inflation Scrape failed: {e}")

    async def scrape_and_process(self):
        async with self.get_http_session() as session:
            await self.scrape_gdp(session)
            await self.scrape_inflation(session)
            await self.db_session.commit()
            return True

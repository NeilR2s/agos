import xml.etree.ElementTree as ET
from datetime import UTC, datetime

from base_scraper import BaseScraper
from config import settings


class BSPScraper(BaseScraper):
    """
    Scraper for Bangko Sentral ng Pilipinas (BSP) data.
    """

    KEY_RATES_SOURCE = settings.BSP_KEY_RATES_SOURCE
    EXCHANGE_RATE_SOURCE = settings.BSP_EXCHANGE_RATES_SOURCE

    async def scrape_key_rates(self, session):
        self.logger.info("Scraping BSP Key Rates...")
        try:
            res = await self.fetch(session, "GET", self.KEY_RATES_SOURCE)
            xml_text = res.text
        except Exception as e:
            self.logger.error(f"Failed to fetch BSP key rates: {e}")
            return

        ns = {
            "atom": settings.BSP_NAMESPACE_ATOM,
            "d": settings.BSP_NAMESPACE_DATA,
            "m": settings.BSP_NAMESPACE_META,
        }

        try:
            root = ET.fromstring(xml_text)
            today_str = datetime.now(UTC).date().isoformat()

            for entry in root.findall("atom:entry", ns):
                props = entry.find(".//m:properties", ns)
                if props is not None:
                    title = props.findtext("d:Title", default="", namespaces=ns)
                    value_str = props.findtext("d:Value", default="", namespaces=ns)

                    # Standardize indicator names
                    indicator_map = {
                        "US$ 1.00": "USD/PHP (Reference)",
                        "Inflation Rate (2018=100)": "Headline Inflation Rate (2018=100)",
                    }
                    display_name = indicator_map.get(title, title)

                    try:
                        val = float(value_str.replace("%", "").replace(",", "").strip())
                        await self.upsert(
                            settings.COSMOS_MACRO_CONTAINER,
                            {
                                "hash": self.generate_hash(
                                    today_str, "BSP", "Key Rates", display_name
                                ),
                                "date": today_str,
                                "source": "BSP",
                                "category": "Key Rates",
                                "indicator": display_name,
                                "value": val,
                                "frequency": "Daily",
                                "description": f"BSP Key Rate: {title}",
                            },
                        )
                    except ValueError:
                        pass
        except Exception as e:
            self.logger.error(f"Failed to parse BSP Key Rates XML: {e}")

    async def scrape_exchange_rates(self, session):
        self.logger.info("Scraping BSP Exchange Rates...")
        try:
            # Use JSON for easier parsing of exchange rates
            headers = {"Accept": "application/json;odata=verbose"}
            res = await self.fetch(session, "GET", self.EXCHANGE_RATE_SOURCE, headers=headers)
            data = res.json()

            items = data.get("d", {}).get("results", [])
            for item in items:
                symbol = item.get("Symbol")
                php_val = item.get("PHPequivalent")
                pub_date = item.get("PublishedDate")

                if not php_val or not pub_date:
                    continue

                # Parse date from ISO format
                try:
                    dt = datetime.fromisoformat(pub_date.replace("Z", "+00:00"))
                    date_str = dt.date().isoformat()
                    val = float(php_val)

                    # Standardize indicator name to USD/PHP (Bulletin)
                    indicator = f"{symbol}/PHP (Bulletin)"
                    await self.upsert(
                        settings.COSMOS_MACRO_CONTAINER,
                        {
                            "hash": self.generate_hash(date_str, "BSP", "Exchange Rate", indicator),
                            "date": date_str,
                            "source": "BSP",
                            "category": "Exchange Rate",
                            "indicator": indicator,
                            "value": val,
                            "frequency": "Daily",
                            "description": f"BSP Daily Exchange Rate Bulletin: {symbol} to PHP",
                        },
                    )
                except (ValueError, TypeError) as e:
                    self.logger.warning(f"Failed to parse exchange rate item: {e}")

        except Exception as e:
            self.logger.error(f"Failed to fetch/parse BSP exchange rates: {e}")

    async def scrape_and_process(self):
        async with self.get_http_session() as session:
            await self.scrape_key_rates(session)
            await self.scrape_exchange_rates(session)
            return True

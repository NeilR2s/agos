import xml.etree.ElementTree as ET
from datetime import UTC, datetime

from base_scraper import BaseScraper
from db import MacroData


class BSPScraper(BaseScraper):
    """
    Scraper for Bangko Sentral ng Pilipinas (BSP) data.
    """
    KEY_RATES_URL = "https://www.bsp.gov.ph/_api/web/lists/getByTitle('Key%20Rates')/items?$select=*&$orderby=Order0%20asc"

    async def scrape_and_process(self):
        self.logger.info("Scraping BSP Key Rates...")

        async with self.get_http_session() as session:
            try:
                res = await self.fetch(session, "GET", self.KEY_RATES_URL)
                xml_text = res.text
            except Exception as e:
                self.logger.error(f"Failed to fetch BSP data: {e}")
                return False

        ns = {
            'atom': 'http://www.w3.org/2005/Atom',
            'd': 'http://schemas.microsoft.com/ado/2007/08/dataservices',
            'm': 'http://schemas.microsoft.com/ado/2007/08/dataservices/metadata'
        }

        try:
            root = ET.fromstring(xml_text)
            today_str = datetime.now(UTC).date().isoformat()

            for entry in root.findall('atom:entry', ns):
                props = entry.find('.//m:properties', ns)
                if props is not None:
                    title = props.findtext('d:Title', default='', namespaces=ns)
                    value_str = props.findtext('d:Value', default='', namespaces=ns)

                    try:
                        val = float(value_str.replace('%', '').replace(',', '').strip())
                        await self.upsert(MacroData, {
                            "hash": self.generate_hash(today_str, "BSP", "Key Rates", title),
                            "date": today_str,
                            "source": "BSP",
                            "category": "Key Rates",
                            "indicator": title,
                            "value": val
                        })
                    except ValueError:
                        pass

            await self.db_session.commit()
            return True
        except Exception as e:
            self.logger.error(f"Failed to parse BSP XML: {e}")
            return False

import asyncio
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

from base_scraper import BaseScraper
from config import settings


class PSEScraper(BaseScraper):
    """
    Scraper for Philippine Stock Exchange (PSE) EDGE data.
    """

    SCRAPE_SOURCE = settings.PSE_DIRECTORY_SEARCH_SOURCE
    FORM_SOURCE = settings.PSE_DIRECTORY_FORM_SOURCE
    STOCK_DATA_SOURCE = settings.PSE_STOCK_DATA_SOURCE
    HOME_SOURCE = settings.PSE_HOME_SOURCE

    def __init__(self, db_client, max_concurrency: int = 20):
        super().__init__(db_client, max_concurrency=max_concurrency)
        home_parts = urlsplit(self.HOME_SOURCE)
        origin = ""
        if home_parts.scheme and home_parts.netloc:
            origin = f"{home_parts.scheme}://{home_parts.netloc}"

        self._form_headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": origin,
            "Referer": self.FORM_SOURCE,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0",
        }

    @staticmethod
    def _is_company_name(text: str) -> bool:
        text = (text or "").strip()
        return len(text) > 5 and not text.isupper()

    @staticmethod
    def _get_total_pages(soup: BeautifulSoup) -> int:
        count_span = soup.find("span", class_="count")
        if count_span:
            match = re.search(r"\[(\d+)\s*/\s*(\d+)\]", count_span.text)
            if match:
                return int(match.group(2))
        return 1

    def _parse_company_list(self, soup: BeautifulSoup) -> list[dict[str, Any]]:
        table = soup.find("table", class_="list")
        if not table:
            return []
        for row in table.find_all("tr")[1:]:
            cols = row.find_all("td")
            if len(cols) < 2:
                continue

            company_a = cols[0].find("a", onclick=True)
            ticker_a = cols[1].find("a", onclick=True)
            if not company_a or not ticker_a:
                continue

            cname = company_a.get_text(strip=True)
            ticker = ticker_a.get_text(strip=True)
            cm = re.search(r"cmDetail\('(\d+)','(\d+)'\)", company_a["onclick"])
            tm = re.search(r"cmDetail\('(\d+)','(\d+)'\)", ticker_a["onclick"])

            if cm and tm and self._is_company_name(cname):
                company_id, security_id = cm.groups()
                yield {
                    "companyName": cname,
                    "companyId": int(company_id),
                    "securityId": int(security_id),
                    "stockTicker": ticker,
                }

    def _parse_stock_data(self, html_content: str) -> dict[str, Any]:
        soup = BeautifulSoup(html_content, "lxml")
        stock_data: dict[str, Any] = {}

        def parse_val(v: str):
            v = v.strip().replace(",", "").replace("\xa0", " ").replace("%", "")
            try:
                return float(v) if "." in v else int(v)
            except ValueError:
                return v or None

        def extract_change(val: str):
            match = re.search(r"\(\s*([-+]?\d*\.?\d+)%\s*\)", val)
            if match:
                value = float(match.group(1))
                return -value if "down" in val.lower() else value
            return None

        def extract_prev_close(val: str):
            match = re.search(r"([\d,]+\.?\d*)", val)
            return float(match.group(1).replace(",", "")) if match else None

        for table in soup.find_all("table", class_="view"):
            for row in table.find_all("tr"):
                cells = row.find_all(["th", "td"])
                for i in range(0, len(cells), 2):
                    if i + 1 < len(cells):
                        k, v = cells[i].get_text(strip=True), cells[i + 1].get_text(strip=True)
                        if "Change(% Change)" in k:
                            stock_data["Change(%)"] = extract_change(v)
                        elif "Previous Close" in k:
                            stock_data["Previous Close"] = extract_prev_close(v)
                        else:
                            stock_data[k] = parse_val(v)

        return stock_data

    async def get_companies(self, session: AsyncSession) -> list[dict[str, Any]]:
        payload = {
            "pageNo": "1",
            "companyId": "",
            "keyword": "",
            "sortType": "",
            "dateSortType": "DESC",
            "cmpySortType": "ASC",
            "symbolSortType": "ASC",
            "sector": "ALL",
            "subsector": "ALL",
        }
        await self.fetch(session, "GET", self.FORM_SOURCE)
        resp = await self.fetch(
            session, "POST", self.SCRAPE_SOURCE, headers=self._form_headers, data=payload
        )
        soup = BeautifulSoup(resp.content, "html.parser")

        total_pages = self._get_total_pages(soup)
        companies = list(self._parse_company_list(soup))

        async def fetch_page(page_num: int):
            p = payload.copy()
            p["pageNo"] = str(page_num)
            r = await self.fetch(
                session, "POST", self.SCRAPE_SOURCE, headers=self._form_headers, data=p
            )
            return list(self._parse_company_list(BeautifulSoup(r.content, "html.parser")))

        tasks = [fetch_page(p) for p in range(2, total_pages + 1)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, list):
                companies.extend(res)
        return companies

    async def process_company(self, session: AsyncSession, company: dict, today_str: str):
        try:
            resp = await self.fetch(
                session,
                "GET",
                self.STOCK_DATA_SOURCE.format(
                    cmpy_id=company["companyId"], sec_id=company["securityId"]
                ),
            )
            s = self._parse_stock_data(resp.text)
            ticker = company["stockTicker"]

            await self.upsert(
                settings.COSMOS_PSE_CONTAINER,
                {
                    "hash": self.generate_hash(today_str, ticker),
                    "date": today_str,
                    "ticker": ticker,
                    "company_name": company["companyName"],
                    "open": s.get("Open"),
                    "high": s.get("High"),
                    "low": s.get("Low"),
                    "close": s.get("Last Traded Price"),
                    "average_price": s.get("Average Price"),
                    "volume": s.get("Volume"),
                    "value": s.get("Value"),
                    "week_52_high": s.get("52-Week High"),
                    "week_52_low": s.get("52-Week Low"),
                    "market_cap": s.get("Market Capitalization"),
                    "outstanding_shares": s.get("Outstanding Shares"),
                    "free_float_level": s.get("Free Float Level(%)"),
                    "change_pct": s.get("Change(%)"),
                    "status": s.get("Status"),
                    "issue_type": s.get("Issue Type"),
                    "isin": s.get("ISIN"),
                    "listing_date": s.get("Listing Date"),
                    "listed_shares": s.get("Listed Shares"),
                    "issued_shares": s.get("Issued Shares"),
                    "board_lot": s.get("Board Lot"),
                    "par_value": s.get("Par Value"),
                    "foreign_ownership_limit": s.get("Foreign Ownership Limit(%)"),
                    "previous_close": s.get("Previous Close"),
                },
            )
        except Exception as e:
            self.logger.error(f"Failed to process {company.get('stockTicker')}: {e}")

    async def scrape_indices(self, session: AsyncSession, today_str: str):
        self.logger.info("Scraping PSE Indices...")
        try:
            resp = await self.fetch(session, "GET", self.HOME_SOURCE)
            soup = BeautifulSoup(resp.content, "html.parser")

            # Find the "Index Summary" heading and its following table
            h3 = None
            for h in soup.find_all("h3"):
                if "Index Summary" in h.get_text():
                    h3 = h
                    break

            if not h3:
                self.logger.warning("Could not find Index Summary heading.")
                return

            table = h3.find_next("table")
            if not table:
                self.logger.warning("Could not find Index Summary table.")
                return

            for row in table.find_all("tr"):
                cols = row.find_all("td")
                if len(cols) < 2:
                    continue

                index_name = cols[0].get_text(strip=True)
                index_val_str = cols[1].get_text(strip=True).replace(",", "")

                try:
                    index_val = float(index_val_str)
                    await self.upsert(
                        settings.COSMOS_MACRO_CONTAINER,
                        {
                            "hash": self.generate_hash(
                                today_str, "PSE", "Market Index", index_name
                            ),
                            "date": today_str,
                            "source": "PSE",
                            "category": "Market Index",
                            "indicator": index_name,
                            "value": index_val,
                            "frequency": "Daily",
                            "description": f"PSE Index Summary: {index_name}",
                        },
                    )
                except ValueError:
                    continue

        except Exception as e:
            self.logger.error(f"Failed to scrape PSE indices: {e}")

    async def scrape_and_process(self):
        self.logger.info("Starting PSE scrape...")
        today_str = datetime.now(UTC).date().isoformat()

        async with self.get_http_session() as session:
            # 1. Scrape Indices
            await self.scrape_indices(session, today_str)

            # 2. Scrape Companies
            companies = await self.get_companies(session)
            self.logger.info(f"Found {len(companies)} companies.")

            chunk_size = 50
            for i in range(0, len(companies), chunk_size):
                chunk = companies[i : i + chunk_size]
                tasks = [self.process_company(session, c, today_str) for c in chunk]
                await asyncio.gather(*tasks)

        return True

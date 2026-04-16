import asyncio
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup
from curl_cffi import requests

logger = logging.getLogger(__name__)

class ScraperError(Exception):
    def __init__(self, message: str, error_code: Optional[str] = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or "SCRAPER_ERROR"
        self.context = context or {}
        self.timestamp = datetime.now(timezone.utc)

class PSEService:
    SCRAPE_URL = "https://edge.pse.com.ph/companyDirectory/search.ax"
    FORM_URL = "https://edge.pse.com.ph/companyDirectory/form.do"
    CHART_ENDPOINT = "https://edge.pse.com.ph/common/DisclosureCht.ax"
    DISCLOSURE_ENDPOINT = "https://edge.pse.com.ph/announcements/search.ax"
    FINANCIAL_ENDPOINT = "https://edge.pse.com.ph/financialReports/search.ax"
    REPORT_ENDPOINT_TEMPLATE = "https://edge.pse.com.ph/companyPage/financial_reports_view.do?cmpy_id={cmpy_id}"
    STOCK_DATA_ENDPOINT = "https://edge.pse.com.ph/companyPage/stockData.do?cmpy_id={cmpy_id}&security_id={sec_id}"
    DIVIDEND_ENDPOINT = "https://edge.pse.com.ph/companyPage/dividends_and_rights_list.ax?DividendsOrRights=Dividends"
    BSP_USD_URL = "https://www.bsp.gov.ph/_api/web/lists/getByTitle('Exchange%20Rate')/items"

    def __init__(self):
        self._form_headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://edge.pse.com.ph",
            "Referer": self.FORM_URL,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0",
        }
        self._json_headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
        self._usd_rate_cache: Optional[float] = None

    @staticmethod
    def _soup(html: str, parser: str = "lxml") -> BeautifulSoup:
        return BeautifulSoup(html, parser)

    async def _get_usd_rate_cached(self, session: requests.AsyncSession) -> Optional[float]:
        if self._usd_rate_cache is not None:
            return self._usd_rate_cache
        try:
            params = {"$select": "*", "$orderby": "Ordering asc"}
            headers = {"Accept": "application/json;odata=verbose"}
            resp = await session.get(self.BSP_USD_URL, params=params, headers=headers)
            if resp.ok:
                data = resp.json()
                results = data["d"]["results"]
                for rate in results:
                    if rate.get("Title") == "UNITED STATES":
                        self._usd_rate_cache = rate.get("PHPequivalent")
                        return self._usd_rate_cache
        except Exception as e:
            logger.warning("Failed to fetch BSP rates: %s", e)
        return None

    async def get_company_info(self, session: requests.AsyncSession, ticker: str) -> Optional[Dict[str, Any]]:
        """Resolves ticker to companyId and securityId."""
        payload = {
            "pageNo": "1",
            "companyId": "",
            "keyword": ticker.upper(),
            "sortType": "",
            "dateSortType": "DESC",
            "cmpySortType": "ASC",
            "symbolSortType": "ASC",
            "sector": "ALL",
            "subsector": "ALL"
        }
        try:
            resp = await session.post(self.SCRAPE_URL, headers=self._form_headers, data=payload)
            if not resp.ok:
                return None
            
            soup = BeautifulSoup(resp.content, "lxml")
            table = soup.find("table", class_="list")
            if not table:
                return None
            
            for row in table.find_all("tr")[1:]:
                cols = row.find_all("td")
                if len(cols) < 2:
                    continue
                ticker_a = cols[1].find("a", onclick=True)
                if not ticker_a:
                    continue
                found_ticker = ticker_a.get_text(strip=True)
                if found_ticker.upper() == ticker.upper():
                    tm = re.search(r"cmDetail\('(\d+)','(\d+)'\)", ticker_a["onclick"])
                    if tm:
                        company_id, security_id = tm.groups()
                        return {
                            "companyName": cols[0].get_text(strip=True),
                            "companyId": int(company_id),
                            "securityId": int(security_id),
                            "stockTicker": found_ticker,
                        }
            return None
        except Exception as e:
            logger.error(f"Error resolving ticker {ticker}: {e}")
            return None

    async def get_ticker_details(self, ticker: str) -> Optional[Dict[str, Any]]:
        async with requests.AsyncSession(impersonate="chrome") as session:
            # Set cookies
            await session.get(self.FORM_URL)
            
            company_info = await self.get_company_info(session, ticker)
            if not company_info:
                return None
            
            # Fetch details similar to original scraper but simplified
            cmpy_id = company_info["companyId"]
            sec_id = company_info["securityId"]
            
            now = datetime.now(timezone(timedelta(hours=8)))

            # Parallel fetch basic data
            tasks = [
                self._fetch_stock_data(session, cmpy_id, sec_id),
                self._fetch_dividends(session, cmpy_id)
            ]
            
            stock_data, dividends = await asyncio.gather(*tasks)
            
            company_info["stockData"] = stock_data
            company_info["dividends"] = dividends
            company_info["lastUpdated"] = now.isoformat()
            
            # Basic Price
            company_info["price"] = stock_data.get("Last Traded Price")
            
            return company_info

    async def get_ticker_chart_data(self, ticker: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        async with requests.AsyncSession(impersonate="chrome") as session:
            await session.get(self.FORM_URL)
            company_info = await self.get_company_info(session, ticker)
            if not company_info:
                return []
            
            cmpy_id = company_info["companyId"]
            sec_id = company_info["securityId"]
            
            now = datetime.now(timezone(timedelta(hours=8)))
            if not end_date:
                end_date = now.strftime("%m-%d-%Y")
            if not start_date:
                start_date = (now - timedelta(days=365)).strftime("%m-%d-%Y")
            
            return await self._fetch_chart_data(session, cmpy_id, sec_id, start_date, end_date)

    async def get_financial_data(self, ticker: str) -> List[Dict[str, Any]]:
        async with requests.AsyncSession(impersonate="chrome") as session:
            await session.get(self.FORM_URL)
            company_info = await self.get_company_info(session, ticker)
            if not company_info:
                return []
            
            cmpy_id = company_info["companyId"]
            name = company_info["companyName"]
            now = datetime.now(timezone(timedelta(hours=8)))
            start_date = now - timedelta(days=365*5)
            
            payload = {
                "companyId": cmpy_id,
                "keyword": name,
                "tmplNm": "",
                "fromDate": start_date.strftime("%m-%d-%Y"),
                "toDate": now.strftime("%m-%d-%Y"),
            }
            
            resp = await session.post(self.FINANCIAL_ENDPOINT, data=payload, headers=self._form_headers)
            return await self._parse_financial_data(session, resp.text)

    async def get_financial_reports(self, ticker: str) -> Dict[str, Any]:
        async with requests.AsyncSession(impersonate="chrome") as session:
            await session.get(self.FORM_URL)
            company_info = await self.get_company_info(session, ticker)
            if not company_info:
                return {}
            
            cmpy_id = company_info["companyId"]
            report_url = self.REPORT_ENDPOINT_TEMPLATE.format(cmpy_id=cmpy_id)
            resp = await session.get(report_url)
            
            usd_rate = await self._get_usd_rate_cached(session)
            return self._parse_financial_reports(resp.text, usd_rate=usd_rate)

    async def _fetch_stock_data(self, session, cmpy_id, sec_id):
        url = self.STOCK_DATA_ENDPOINT.format(cmpy_id=cmpy_id, sec_id=sec_id)
        resp = await session.get(url)
        return self._parse_stock_data(resp.text)

    async def _fetch_dividends(self, session, cmpy_id):
        resp = await session.post(self.DIVIDEND_ENDPOINT, data={"cmpy_id": cmpy_id}, headers=self._form_headers)
        return self._parse_dividends(resp.text)

    async def _fetch_chart_data(self, session, cmpy_id, sec_id, start_date, end_date):
        payload = {
            "cmpy_id": cmpy_id,
            "security_id": sec_id,
            "startDate": start_date,
            "endDate": end_date
        }
        resp = await session.post(self.CHART_ENDPOINT, json=payload, headers=self._json_headers)
        return resp.json().get("chartData", [])

    def _parse_stock_data(self, html):
        soup = BeautifulSoup(html, "lxml")
        data = {}
        def parse_num(v):
            if not v: return None
            v = v.strip().replace(",", "")
            try: return float(v) if "." in v else int(v)
            except: return None

        table = soup.find("table", class_="view")
        if table:
            for row in table.find_all("tr"):
                cells = row.find_all(["th", "td"])
                if len(cells) == 4:
                    data[cells[0].get_text(strip=True)] = parse_num(cells[1].get_text())
                    data[cells[2].get_text(strip=True)] = parse_num(cells[3].get_text())
        
        price_table = table.find_next("table", class_="view") if table else None
        if price_table:
            for row in price_table.find_all("tr"):
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    k = cells[0].get_text(strip=True)
                    v = parse_num(cells[1].get_text())
                    if k == "Last Traded Price": data[k] = v
                    elif "volume" in k.lower(): data["Volume"] = v
        return data

    def _parse_dividends(self, html):
        soup = BeautifulSoup(html, "lxml")
        table = soup.find("table", class_="list")
        results = []
        if not table: return results
        tbody = table.find("tbody")
        if not tbody: return results
        for tr in tbody.find_all("tr"):
            cols = tr.find_all("td")
            if not cols: continue
            results.append({
                "Type of Dividend": cols[1].get_text(strip=True) if len(cols) > 1 else "",
                "Dividend Rate": cols[2].get_text(strip=True) if len(cols) > 2 else "",
                "Ex-Dividend Date": cols[3].get_text(strip=True) if len(cols) > 3 else "",
                "Record Date": cols[4].get_text(strip=True) if len(cols) > 4 else "",
                "Payment Date": cols[5].get_text(strip=True) if len(cols) > 5 else "",
            })
        return results

    async def _parse_financial_data(self, session: requests.AsyncSession, html_content: str, limit: int = 100) -> List[Dict[str, Any]]:
        soup = self._soup(html_content)
        financials = []
        for tr in soup.find_all("tr"):
            link = tr.find("a", href="#viewer")
            if not link:
                continue
            onclick = link.get("onclick", "")
            edge_no = None
            if onclick:
                parts = onclick.split("'")
                if len(parts) > 1:
                    edge_no = parts[1]
            tds = tr.find_all("td")
            if len(tds) >= 5:
                link_url = f"https://edge.pse.com.ph/openDiscViewer.do?edge_no={edge_no}" if edge_no else None
                file_link = None
                
                if link_url:
                    try:
                        response = await session.get(link_url)
                        link_soup = self._soup(response.text)
                        
                        view_option_div = link_soup.find("div", id="viewOption")
                        if view_option_div:
                            p_tags = view_option_div.find_all("p")
                            if len(p_tags) >= 2:
                                second_p = p_tags[1]
                                select_tag = second_p.find("select")
                                if select_tag:
                                    option_tags = select_tag.find_all("option")
                                    if len(option_tags) >= 2:
                                        fileID = option_tags[1].get("value")
                                        file_link = f"https://edge.pse.com.ph/downloadHtml.do?file_id={fileID}"
                    except Exception as e:
                        logger.warning("Error fetching FileLink for edge_no %s: %s", edge_no, e)
                
                financials.append({
                    "Company Name": tds[0].get_text(strip=True),
                    "Report Type": tds[1].get_text(strip=True),
                    "PSE Form Number": tds[2].get_text(strip=True),
                    "Date": tds[3].get_text(strip=True),
                    "Report Number": tds[4].get_text(strip=True),
                    "edge_no": edge_no,
                    "Link": link_url,
                    "FileLink": file_link
                })
            if len(financials) >= limit:
                break
        return financials

    def _parse_financial_reports(self, html_content: str, usd_rate: Optional[float] = None) -> Dict[str, Any]:
        soup = self._soup(html_content)
        reports = {"yearly": {}, "quarterly": {}}
        current_section = None
        fiscal_year = None
        quarter = None
        quarter_year = None
        scale_factor = 1

        for elem in soup.find_all(["h3", "p", "table"]):
            if elem.name == "h3":
                txt = elem.get_text(" ", strip=True).lower()
                if "annual" in txt:
                    current_section = "annual"
                elif "quarterly" in txt:
                    current_section = "quarterly"

            elif elem.name == "p" and "textCont" in elem.get("class", []):
                text = elem.get_text(" ", strip=True)

                if current_section == "annual":
                    fy_match = re.search(r"For the fiscal year ended\s*:\s*([A-Za-z]{3,9} \d{1,2}, \d{4})", text, re.I)
                    if fy_match:
                        fiscal_year = int(fy_match.group(1).split(",")[-1].strip())
                        reports["yearly"] = {"year": fiscal_year, "income_statement": [], "balance_sheet": [], "scale_factor": 1}
                if current_section == "quarterly":
                    q_match = re.search(r"period ended\s*:\s*([A-Za-z]{3,9} \d{1,2}, \d{4})", text, re.I)
                    if q_match:
                        month_str = q_match.group(1).split()[0][:3].lower()
                        quarter_map = {"mar": "Q1", "jun": "Q2", "sep": "Q3", "dec": "Q4"}
                        quarter = next((q for m, q in quarter_map.items() if month_str.startswith(m)), None)
                        quarter_year = int(q_match.group(1).split(",")[-1].strip())
                        reports["quarterly"] = {"year": quarter_year, "quarter": quarter, "income_statement": {}, "balance_sheet": {}, "scale_factor": 1}
                
                unit_match = re.search(r"currency.*?:\s*(.+)", text, re.I)
                if unit_match:
                    unit_text = unit_match.group(1).lower()
                    scale_factor = 1
                    is_usd = False
                    if "'000" in unit_text or "thousand" in unit_text:
                        scale_factor = 1_000
                    elif "million" in unit_text or re.search(r"\b(m|m php|php m|m usd|usd m)\b", unit_text):
                        scale_factor = 1_000_000
                    else:
                        scale_factor = 1
                    if any(u in unit_text for u in ["usd", "us dollar", "us$"]) and not any(u in unit_text for u in ["php", "peso"]):
                        is_usd = True
                        scale_factor *= (usd_rate or 1)

                    if current_section == "annual" and fiscal_year:
                        reports.setdefault("yearly", {})["scale_factor"] = scale_factor
                        if is_usd: reports["yearly"]["usd_rate"] = usd_rate
                    elif current_section == "quarterly" and quarter_year and quarter:
                        reports.setdefault("quarterly", {})["scale_factor"] = scale_factor
                        if is_usd: reports["quarterly"]["usd_rate"] = usd_rate

            elif elem.name == "table" and "view" in elem.get("class", []):
                caption = elem.find("caption")
                if not caption: continue
                caption_text = caption.get_text(strip=True).lower()
                rows = elem.find_all("tr")
                if not rows: continue
                headers = [th.get_text(strip=True) for th in rows[0].find_all("th")]
                data_rows = [
                    dict(zip(headers, [cell.get_text(strip=True) for cell in tr.find_all(["td", "th"])]))
                    for tr in rows[1:]
                ]

                def convert_row(row, sf):
                    item_name = row.get("Item", "").lower()
                    new_row = {}
                    for k, v in row.items():
                        if k == "Item":
                            new_row[k] = v
                            continue
                        try:
                            val = float(v.replace(",", ""))
                            new_row[k] = val if "per share" in item_name else val * sf
                        except:
                            new_row[k] = v
                    return new_row

                data_rows = [convert_row(r, scale_factor) for r in data_rows]

                if current_section == "annual":
                    if "income statement" in caption_text: reports["yearly"]["income_statement"] = data_rows
                    elif "balance sheet" in caption_text: reports["yearly"]["balance_sheet"] = data_rows
                elif current_section == "quarterly":
                    if "income statement" in caption_text: reports["quarterly"]["income_statement"] = data_rows
                    elif "balance sheet" in caption_text: reports["quarterly"]["balance_sheet"] = data_rows

        return reports

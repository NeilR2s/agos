import asyncio
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup
from curl_cffi import requests

logger = logging.getLogger(__name__)

class StockApi:
    """A minimal, asynchronous API client for the Philippine Stock Exchange (PSE) Edge portal."""
    
    # TODO: hide these ugly ass connection strings in a config
    SCRAPE_URL = "https://edge.pse.com.ph/companyDirectory/search.ax"
    FORM_URL = "https://edge.pse.com.ph/companyDirectory/form.do"
    CHART_ENDPOINT = "https://edge.pse.com.ph/common/DisclosureCht.ax"
    DISCLOSURE_ENDPOINT = "https://edge.pse.com.ph/announcements/search.ax"
    FINANCIAL_ENDPOINT = "https://edge.pse.com.ph/financialReports/search.ax"
    REPORT_ENDPOINT_TEMPLATE = "https://edge.pse.com.ph/companyPage/financial_reports_view.do?cmpy_id={cmpy_id}"
    INDEX_SUMMARY_ENDPOINT = "https://edge.pse.com.ph/index/form.do"
    STOCK_DATA_ENDPOINT = "https://edge.pse.com.ph/companyPage/stockData.do?cmpy_id={cmpy_id}&security_id={sec_id}"
    DIVIDEND_ENDPOINT = "https://edge.pse.com.ph/companyPage/dividends_and_rights_list.ax?DividendsOrRights=Dividends"
    TRI_ENDPOINT = "https://frames.pse.com.ph/compositeSector"
    BSP_USD_ENDPOINT = "https://www.bsp.gov.ph/_api/web/lists/getByTitle('Exchange%20Rate')/items"

    def __init__(self, max_concurrency: int = 20, timeout: int = 60):
        self._http_sem = asyncio.Semaphore(max_concurrency)
        self.timeout = timeout
        self._form_headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": "https://edge.pse.com.ph",
            "Referer": self.FORM_URL,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0",
        }
        self._json_headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}

    async def _post(self, session: requests.AsyncSession, url: str, **kwargs) -> requests.Response:
        async with self._http_sem:
            kwargs.setdefault('timeout', self.timeout)
            response = await session.post(url, **kwargs)
            response.raise_for_status()
            return response

    async def _get(self, session: requests.AsyncSession, url: str, **kwargs) -> requests.Response:
        async with self._http_sem:
            kwargs.setdefault('timeout', self.timeout)
            response = await session.get(url, **kwargs)
            response.raise_for_status()
            return response

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

    def _parse_company_list(self, soup: BeautifulSoup, target_tickers: Optional[set] = None) -> List[Dict[str, Any]]:
        table = soup.find("table", class_="list")
        if not table:
            return []
        companies = []
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
                if target_tickers is None or ticker in target_tickers:
                    company_id, security_id = cm.groups()
                    companies.append({
                        "companyName": cname,
                        "companyId": int(company_id),
                        "securityId": int(security_id),
                        "stockTicker": ticker,
                    })
        return companies

    def _parse_stock_data(self, html_content: str) -> Dict[str, Optional[float]]:
        soup = BeautifulSoup(html_content, "lxml")
        stock_data: Dict[str, Optional[float]] = {}

        def parse_number(val: str):
            if not val:
                return None
            v = val.strip().replace(",", "").replace("\xa0", " ")
            try:
                return float(v) if "." in v else int(v)
            except ValueError:
                return None

        table = soup.find("table", class_="view")
        if not table:
            return stock_data
            
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) != 4:
                continue
            k1 = cells[0].get_text(strip=True)
            v1 = parse_number(cells[1].get_text())
            k2 = cells[2].get_text(strip=True)
            v2 = parse_number(cells[3].get_text())
            
            for k, v in ((k1, v1), (k2, v2)):
                if k in ["Market Capitalization", "Outstanding Shares", "Listed Shares", "Issued Shares"]:
                    stock_data[k] = v
        
        priceTable = table.find_next("table", class_="view")
        if priceTable:
            for row in priceTable.find_all("tr"):
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    k1 = cells[0].get_text(strip=True)
                    v1 = parse_number(cells[1].get_text())
                    if k1 == "Last Traded Price":
                        stock_data[k1] = v1
                    elif "volume" in k1.lower():
                        stock_data["Volume"] = v1
        return stock_data


    async def get_companies(self, session: requests.AsyncSession, target_tickers: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Fetch the list of companies from the PSE Edge directory."""
        ticker_set = set(target_tickers) if target_tickers else None
        payload = {
            "pageNo": "1", "companyId": "", "keyword": "", "sortType": "",
            "dateSortType": "DESC", "cmpySortType": "ASC", "symbolSortType": "ASC",
            "sector": "ALL", "subsector": "ALL"
        }
        
        await session.get(self.FORM_URL, timeout=self.timeout) # Get initial cookies
        resp = await self._post(session, self.SCRAPE_URL, headers=self._form_headers, data=payload)
        soup = BeautifulSoup(resp.content, "html.parser")
        
        total_pages = self._get_total_pages(soup)
        companies = self._parse_company_list(soup, ticker_set)

        async def fetch_page(page_num: int):
            local_payload = payload.copy()
            local_payload["pageNo"] = str(page_num)
            r = await self._post(session, self.SCRAPE_URL, headers=self._form_headers, data=local_payload)
            return self._parse_company_list(BeautifulSoup(r.content, "html.parser"), ticker_set)

        tasks = [fetch_page(p) for p in range(2, total_pages + 1)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for res in results:
            if isinstance(res, list):
                companies.extend(res)
                
        return companies

    async def get_company_details(self, session: requests.AsyncSession, cmpy_id: int, sec_id: int, ticker: str, name: str) -> Dict[str, Any]:
        """Fetch chart, stock data, and dividend info for a specific company."""
        now = datetime.now(timezone(timedelta(hours=8)))
        start_of_last_year = now - timedelta(days=1825)
        date_str_format = "%m-%d-%Y"
        
        payload = {
            "companyId": cmpy_id,
            "keyword": name,
            "tmplNm": "",
            "fromDate": start_of_last_year.strftime(date_str_format),
            "toDate": now.strftime(date_str_format),
        }

        chart_task = self._post(
            session, self.CHART_ENDPOINT,
            json={"cmpy_id": cmpy_id, "security_id": sec_id, "startDate": payload["fromDate"], "endDate": payload["toDate"]},
            headers=self._json_headers
        )
        stock_task = self._get(session, self.STOCK_DATA_ENDPOINT.format(cmpy_id=cmpy_id, sec_id=sec_id))
        
        dividend_task = self._post(session, self.DIVIDEND_ENDPOINT, data={"cmpy_id": cmpy_id}, headers=self._form_headers)

        chart_resp, stock_resp, div_resp = await asyncio.gather(chart_task, stock_task, dividend_task)

        chart_data = chart_resp.json().get("chartData", [])

        stock_data = self._parse_stock_data(stock_resp.text)
        
        div_soup = BeautifulSoup(div_resp.text, "lxml")
        dividends = []
        div_table = div_soup.find("table", class_="list")
        if div_table and div_table.find("tbody"):
            for tr in div_table.find("tbody").find_all("tr"):
                cols = [td.get_text(strip=True) for td in tr.find_all("td")]
                if len(cols) >= 6:
                    dividends.append({
                        "Type of Security": cols[0],
                        "Type of Dividend": cols[1],
                        "Dividend Rate": cols[2],
                        "Ex-Dividend Date": cols[3],
                        "Record Date": cols[4],
                        "Payment Date": cols[5],
                    })

        return {
            "companyId": cmpy_id,
            "securityId": sec_id,
            "stockTicker": ticker,
            "companyName": name,
            "stockData": stock_data,
            "chartData": chart_data,
            "dividends": dividends
        }

    async def get_market_summary(self, session: requests.AsyncSession) -> Dict[str, Any]:
        """Fetch the current market and index summary."""
        resp = await self._get(session, self.INDEX_SUMMARY_ENDPOINT)
        soup = BeautifulSoup(resp.text, "lxml")
        
        # Parse Index Table
        index_table = soup.select_one('div#index table.list')
        indices = []
        if index_table and index_table.find("tbody"):
            for tr in index_table.find("tbody").find_all("tr"):
                cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                if len(cells) >= 4:
                    indices.append({
                        "Index": cells[0],
                        "Value": cells[1],
                        "Change": cells[2],
                        "%Change": cells[3]
                    })
                    
        # Parse Market Table
        market_table = soup.select_one('#market table.list')
        market_summary = {}
        if market_table and market_table.find("tbody"):
            for tr in market_table.find("tbody").find_all("tr"):
                tds = [td.get_text(strip=True) for td in tr.find_all("td")]
                if len(tds) == 2:
                    key = tds[0].strip().lower().replace(" ", "_")
                    val = tds[1].replace(",", "")
                    try:
                        market_summary[key] = float(val) if "." in val else int(val)
                    except ValueError:
                        market_summary[key] = tds[1].strip()

        return {
            "indices": indices,
            "market": market_summary
        }

    async def get_usd_rate(self) -> Optional[float]:
        """Fetch USD exchange rate from BSP."""
        params = {"$select": "*", "$orderby": "Ordering asc"}
        headers = {"Accept": "application/json;odata=verbose"}
        try:
            resp = requests.get(self.BSP_USD_ENDPOINT, params=params, headers=headers, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            for rate in data.get("d", {}).get("results", []):
                if rate.get("Title") == "UNITED STATES":
                    return rate.get("PHPequivalent")
        except Exception as e:
            logger.warning("Failed to fetch BSP rates: %s", e)
        return None
    

# uncomment below to test, this is an example of how you would use the code for whatever purpose.
# if __name__ == "__main__":
    
    # async def main():
    #     logging.basicConfig(level=logging.INFO)
    #     print("Starting minimal tests for StockApi...")
        
    #     api = StockApi(max_concurrency=5, timeout=30)
        
    #     # Test standalone endpoint (BSP USD Rate)
    #     print("\n--- Testing BSP USD Rate ---")
    #     usd_rate = await api.get_usd_rate()
    #     print(f"USD to PHP Rate: {usd_rate}")
        
    #     async with requests.AsyncSession() as session:
            
    #         # Test Market Summary
    #         print("\n--- Testing Market Summary ---")
    #         market_summary = await api.get_market_summary(session)
    #         print(f"Indices retrieved: {len(market_summary.get('indices', []))}")
    #         if market_summary.get('indices'):
    #             print(f"Sample Index: {market_summary['indices'][0]}")
    #         print(f"Market stats: {market_summary.get('market')}")
            
    #         # Test Company Search 
    #         target = "ICT"
    #         print(f"\n--- Testing Company Search (Target: {target}) ---")
    #         companies = await api.get_companies(session, target_tickers=[target])
    #         print(f"Found companies matching {target}: {len(companies)}")
            
    #         # Test Company Details
    #         if companies:
    #             c = companies[0]
    #             print(f"\n--- Testing Company Details for {c['stockTicker']} ---")
    #             details = await api.get_company_details(
    #                 session,
    #                 cmpy_id=c["companyId"],
    #                 sec_id=c["securityId"],
    #                 ticker=c["stockTicker"],
    #                 name=c["companyName"]
    #             )
    #             print(f"Stock Data: {details['stockData']}")
    #             print(f"Chart Data Points: {len(details['chartData'])}")
    #             print(f"Dividends History Count: {len(details['dividends'])}")
    #             if details['dividends']:
    #                 print(f"Latest Dividend: {details['dividends'][0]}")
    #         else:
    #             print(f"Could not find ticker {target} to test company details.")

    # asyncio.run(main())
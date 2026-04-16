from fastapi import APIRouter, HTTPException, Query
from app.services.scraper import PSEService
from typing import Optional

router = APIRouter()
scraper = PSEService()

@router.get("/{ticker}")
async def get_market_data(ticker: str):
    data = await scraper.get_ticker_details(ticker)
    if not data:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")
    return data

@router.get("/{ticker}/chart")
async def get_market_chart(
    ticker: str, 
    start_date: Optional[str] = Query(None, description="Format: MM-DD-YYYY"),
    end_date: Optional[str] = Query(None, description="Format: MM-DD-YYYY")
):
    data = await scraper.get_ticker_chart_data(ticker, start_date, end_date)
    return {"ticker": ticker.upper(), "chartData": data}

@router.get("/{ticker}/financial-data")
async def get_financial_data(ticker: str):
    data = await scraper.get_financial_data(ticker)
    if not data:
        raise HTTPException(status_code=404, detail=f"Financial data for {ticker} not found")
    return {"ticker": ticker.upper(), "financialData": data}

@router.get("/{ticker}/financial-reports")
async def get_financial_reports(ticker: str):
    data = await scraper.get_financial_reports(ticker)
    if not data:
        raise HTTPException(status_code=404, detail=f"Financial reports for {ticker} not found")
    return {"ticker": ticker.upper(), "financialReports": data}

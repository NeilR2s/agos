from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.db.cosmos import get_db, CosmosDB

router = APIRouter()

@router.get("/macro")
async def get_macro_data(
    indicator: Optional[str] = Query(None, description="Filter by indicator name"),
    limit: int = Query(50, ge=1, le=1000, description="Number of records to return"),
    db: CosmosDB = Depends(get_db)
):
    """
    Retrieve the latest macroeconomic data (e.g., inflation, GDP, PSE market indices).
    """
    data = db.get_latest_macro_data(indicator=indicator, limit=limit)
    return {"data": data}

@router.get("/news")
async def get_news_data(
    ticker: Optional[str] = Query(None, description="Filter by ticker symbol"),
    limit: int = Query(50, ge=1, le=1000, description="Number of records to return"),
    db: CosmosDB = Depends(get_db)
):
    """
    Retrieve the latest news sentiment data.
    """
    data = db.get_latest_news_data(ticker=ticker, limit=limit)
    return {"data": data}

@router.get("/pse")
async def get_pse_data(
    ticker: Optional[str] = Query(None, description="Filter by ticker symbol"),
    limit: int = Query(50, ge=1, le=1000, description="Number of records to return"),
    db: CosmosDB = Depends(get_db)
):
    """
    Retrieve the latest daily stock market data from PSE.
    """
    data = db.get_latest_pse_data(ticker=ticker, limit=limit)
    return {"data": data}

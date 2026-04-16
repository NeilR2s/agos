from fastapi import APIRouter, Depends, HTTPException
from app.models.domain import Portfolio, HoldingCreate, Holding, HoldingUpdate, Cash, CashUpdate
from app.services.portfolio import PortfolioService

router = APIRouter()

def get_portfolio_service():
    return PortfolioService()

@router.get("/{user_id}", response_model=Portfolio)
async def get_portfolio(user_id: str, service: PortfolioService = Depends(get_portfolio_service)):
    return await service.get_user_portfolio(user_id)

@router.get("/{user_id}/holdings/{ticker}", response_model=Holding)
async def get_holding(user_id: str, ticker: str, service: PortfolioService = Depends(get_portfolio_service)):
    holding = await service.get_holding(user_id, ticker)
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    return holding

@router.post("/{user_id}/holdings")
async def add_holding(user_id: str, holding: HoldingCreate, service: PortfolioService = Depends(get_portfolio_service)):
    service.add_holding(user_id, holding.ticker, holding.shares, holding.avgPrice)
    return {"message": "Holding added successfully"}

@router.put("/{user_id}/holdings/{ticker}")
async def update_holding(user_id: str, ticker: str, holding: HoldingUpdate, service: PortfolioService = Depends(get_portfolio_service)):
    result = service.update_holding(user_id, ticker, holding.shares, holding.avgPrice)
    if not result:
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"message": "Holding updated successfully"}

@router.delete("/{user_id}/holdings/{ticker}")
async def delete_holding(user_id: str, ticker: str, service: PortfolioService = Depends(get_portfolio_service)):
    service.remove_holding(user_id, ticker)
    return {"message": "Holding removed successfully"}

@router.get("/{user_id}/cash", response_model=Cash)
async def get_cash(user_id: str, service: PortfolioService = Depends(get_portfolio_service)):
    cash = service.get_cash(user_id)
    if not cash:
        return Cash(amount=0.0)
    return Cash(amount=cash['amount'])

@router.put("/{user_id}/cash")
async def update_cash(user_id: str, cash: CashUpdate, service: PortfolioService = Depends(get_portfolio_service)):
    service.update_cash(user_id, cash.amount)
    return {"message": "Cash balance updated successfully"}

@router.delete("/{user_id}/cash")
async def delete_cash(user_id: str, service: PortfolioService = Depends(get_portfolio_service)):
    service.remove_cash(user_id)
    return {"message": "Cash balance reset successfully"}

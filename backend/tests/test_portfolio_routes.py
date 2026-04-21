import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.portfolio import router, get_portfolio_service
from app.models.domain import Portfolio, Holding, Cash
from app.core.security import get_current_user

app = FastAPI()

# Mock auth
async def mock_get_current_user():
    return {"uid": "test_user_123"}

app.include_router(router, prefix="/portfolio")
app.dependency_overrides[get_current_user] = mock_get_current_user

client = TestClient(app)

@pytest.fixture
def mock_portfolio_service():
    with patch("app.api.routes.portfolio.PortfolioService") as MockService:
        service = MockService.return_value
        # Mock responses
        service.get_user_portfolio.return_value = Portfolio(
            userId="test_user_123",
            holdings=[Holding(id="1", userId="test_user_123", ticker="ALI", shares=100, avgPrice=35.0, currentPrice=36.0, marketValue=3600.0, gainLoss=100.0, gainLossPercent=0.028)],
            liquidCash=10000.0,
            totalMarketValue=3600.0,
            totalPortfolioValue=13600.0
        )
        service.get_holding.return_value = Holding(id="1", userId="test_user_123", ticker="ALI", shares=100, avgPrice=35.0, currentPrice=36.0, marketValue=3600.0, gainLoss=100.0, gainLossPercent=0.028)
        service.get_cash.return_value = {"amount": 10000.0}
        
        # Async functions
        service.get_user_portfolio = AsyncMock(return_value=Portfolio(
            userId="test_user_123",
            holdings=[Holding(id="1", userId="test_user_123", ticker="ALI", shares=100, avgPrice=35.0, currentPrice=36.0, marketValue=3600.0, gainLoss=100.0, gainLossPercent=0.028)],
            liquidCash=10000.0,
            totalMarketValue=3600.0,
            totalPortfolioValue=13600.0
        ))
        service.get_holding = AsyncMock(return_value=Holding(id="1", userId="test_user_123", ticker="ALI", shares=100, avgPrice=35.0, currentPrice=36.0, marketValue=3600.0, gainLoss=100.0, gainLossPercent=0.028))
        service.add_holding = AsyncMock(return_value=None)
        service.update_holding = AsyncMock(return_value=True)
        service.remove_holding = AsyncMock(return_value=None)
        service.get_cash = AsyncMock(return_value={"amount": 10000.0})
        service.update_cash = AsyncMock(return_value=None)
        service.remove_cash = AsyncMock(return_value=None)
        
        yield service

def test_get_portfolio_success(mock_portfolio_service):
    app.dependency_overrides[get_portfolio_service] = lambda: mock_portfolio_service
    response = client.get("/portfolio/test_user_123")
    assert response.status_code == 200
    assert response.json()["userId"] == "test_user_123"
    assert len(response.json()["holdings"]) == 1

def test_get_portfolio_forbidden(mock_portfolio_service):
    # Try accessing another user's portfolio
    app.dependency_overrides[get_portfolio_service] = lambda: mock_portfolio_service
    response = client.get("/portfolio/other_user_456")
    assert response.status_code == 403

def test_add_holding(mock_portfolio_service):
    app.dependency_overrides[get_portfolio_service] = lambda: mock_portfolio_service
    response = client.post("/portfolio/test_user_123/holdings", json={"ticker": "BDO", "shares": 50, "avgPrice": 120.0})
    assert response.status_code == 200
    assert response.json()["message"] == "Holding added successfully"

def test_update_holding(mock_portfolio_service):
    app.dependency_overrides[get_portfolio_service] = lambda: mock_portfolio_service
    response = client.put("/portfolio/test_user_123/holdings/ALI", json={"shares": 150, "avgPrice": 34.0})
    assert response.status_code == 200

def test_get_cash(mock_portfolio_service):
    app.dependency_overrides[get_portfolio_service] = lambda: mock_portfolio_service
    response = client.get("/portfolio/test_user_123/cash")
    assert response.status_code == 200
    assert response.json()["amount"] == 10000.0

import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.market import router, scraper
from app.core.security import get_current_user

app = FastAPI()

async def mock_get_current_user():
    return {"uid": "test_user_123"}

app.include_router(router, prefix="/market")
app.dependency_overrides[get_current_user] = mock_get_current_user

client = TestClient(app)

@pytest.fixture
def mock_pse_service():
    with patch("app.api.routes.market.scraper") as mock_scraper:
        mock_scraper.get_ticker_details = AsyncMock(return_value={"stockTicker": "ALI", "companyName": "Ayala Land", "price": 36.0})
        mock_scraper.get_ticker_chart_data = AsyncMock(return_value=[{"date": "2023-01-01", "close": 35.0}])
        mock_scraper.get_financial_data = AsyncMock(return_value={"revenue": 1000000})
        mock_scraper.get_financial_reports = AsyncMock(return_value=[{"report": "Q1"}])
        yield mock_scraper

def test_get_market_data(mock_pse_service):
    response = client.get("/market/ALI")
    assert response.status_code == 200
    assert response.json()["stockTicker"] == "ALI"

def test_get_market_chart(mock_pse_service):
    response = client.get("/market/ALI/chart")
    assert response.status_code == 200
    assert len(response.json()["chartData"]) == 1

def test_get_financial_data(mock_pse_service):
    response = client.get("/market/ALI/financial-data")
    assert response.status_code == 200
    assert response.json()["financialData"]["revenue"] == 1000000

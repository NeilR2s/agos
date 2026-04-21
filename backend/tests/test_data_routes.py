import pytest
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes.data import router
from app.core.security import get_current_user
from app.db.cosmos import get_db

app = FastAPI()

async def mock_get_current_user():
    return {"uid": "test_user_123"}

app.include_router(router, prefix="/data")
app.dependency_overrides[get_current_user] = mock_get_current_user

client = TestClient(app)

@pytest.fixture
def mock_db():
    mock_db_instance = AsyncMock()
    mock_db_instance.get_latest_macro_data.return_value = [{"indicator": "GDP", "value": 6.0}]
    mock_db_instance.get_latest_news_data.return_value = [{"title": "Good news"}]
    mock_db_instance.get_latest_pse_data.return_value = [{"ticker": "ALI", "close": 36.0}]
    
    app.dependency_overrides[get_db] = lambda: mock_db_instance
    return mock_db_instance

def test_get_macro_data(mock_db):
    response = client.get("/data/macro")
    assert response.status_code == 200
    assert response.json()["data"][0]["indicator"] == "GDP"

def test_get_news_data(mock_db):
    response = client.get("/data/news")
    assert response.status_code == 200
    assert response.json()["data"][0]["title"] == "Good news"

def test_get_pse_data(mock_db):
    response = client.get("/data/pse")
    assert response.status_code == 200
    assert response.json()["data"][0]["ticker"] == "ALI"

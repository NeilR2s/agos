from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

# Enable DEV_BYPASS for tests
settings.DEV_BYPASS_ENABLED = True
auth_headers = {"Authorization": "Bearer dev_admin_token"}

client = TestClient(app)

def test_health_check_loading():
    # Before lifespan runs or if pipeline is None
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "loading"

def test_forecast_invalid_history():
    response = client.post("/api/v1/forecast/", json={"history": [1.0, 2.0], "prediction_length": 5}, headers=auth_headers)
    assert response.status_code == 503
    assert "not initialized" in response.json()["detail"]

def test_evaluate_not_initialized():
    response = client.post("/api/v1/trading/evaluate", json={"user_id": "u1", "ticker": "AAPL"}, headers=auth_headers)
    assert response.status_code == 503
    assert "not initialized" in response.json()["detail"]

from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from typing import AsyncIterator

from app.main import app
from app.services.agent.service import AgentService, get_agent_service
from app.core.security import get_current_user
from app.models.agent import AgentThread, AgentRun, AgentSSEEvent

def override_get_current_user():
    return {"uid": "test_user_id"}

def override_get_agent_service():
    mock_service = MagicMock(spec=AgentService)
    
    mock_thread = AgentThread(
        id="test_thread_id",
        userId="test_user_id",
        title="Test Thread",
        mode="research",
        selectedTicker=None,
        createdAt="2023-01-01T00:00:00Z",
        updatedAt="2023-01-01T00:00:00Z",
    )
    mock_service.get_thread.return_value = mock_thread
    
    mock_run = AgentRun(
        id="test_run_id",
        threadId="test_thread_id",
        userId="test_user_id",
        model="test-model",
        mode="research",
        status="completed",
        startedAt="2023-01-01T00:00:00Z",
    )
    mock_service.get_run.return_value = mock_run

    async def mock_cancel_run(*args, **kwargs):
        return mock_run.model_copy(update={"status": "cancelled"})

    mock_service.cancel_run = mock_cancel_run

    mock_service.list_threads.return_value = [mock_thread]
    
    async def mock_create_thread(*args, **kwargs):
        return mock_thread
        
    mock_service.create_thread = mock_create_thread

    async def mock_stream_run_events(*args, **kwargs) -> AsyncIterator[AgentSSEEvent]:
        yield AgentSSEEvent(
            threadId="test_thread_id",
            runId="test_run_id",
            timestamp="2023-01-01T00:00:00Z",
            sequence=1,
            type="message.delta",
            data={"delta": "Hello"}
        )
        yield AgentSSEEvent(
            threadId="test_thread_id",
            runId="test_run_id",
            timestamp="2023-01-01T00:00:00Z",
            sequence=2,
            type="run.completed",
            data={}
        )

    mock_service.stream_run_events = mock_stream_run_events

    return mock_service

app.dependency_overrides[get_current_user] = override_get_current_user
app.dependency_overrides[get_agent_service] = override_get_agent_service

client = TestClient(app)


def test_list_threads():
    response = client.get("/api/v1/agent/threads")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "test_thread_id"


def test_get_thread():
    response = client.get("/api/v1/agent/threads/test_thread_id")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test_thread_id"


def test_create_thread():
    payload = {"title": "New", "mode": "research", "selectedTicker": "AAPL"}
    response = client.post("/api/v1/agent/threads", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "test_thread_id"


def test_get_run():
    response = client.get("/api/v1/agent/threads/test_thread_id/runs/test_run_id")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test_run_id"


def test_cancel_run():
    response = client.post("/api/v1/agent/threads/test_thread_id/runs/test_run_id/cancel")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test_run_id"
    assert data["status"] == "cancelled"


def test_stream_run():
    payload = {"message": "hello", "mode": "research"}
    response = client.post("/api/v1/agent/threads/test_thread_id/runs/stream", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
    
    content = response.text
    assert "event: message.delta" in content
    assert "event: run.completed" in content
    assert "data: {\"threadId\": \"test_thread_id\"" in content

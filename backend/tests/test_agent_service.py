import asyncio

from langchain_core.messages import AIMessage

from app.models.agent import AgentMessage, AgentRunRequest, AgentThread
from app.services.agent.service import AgentService
from app.core.config import settings


def _thread() -> AgentThread:
    return AgentThread(
        id="thread-1",
        userId="user-1",
        title="Test Thread",
        mode="research",
        selectedTicker=None,
        createdAt="2024-01-01T00:00:00Z",
        updatedAt="2024-01-01T00:00:00Z",
    )


def _message(message_id: str, role: str, content: str, created_at: str) -> AgentMessage:
    return AgentMessage(
        id=message_id,
        threadId="thread-1",
        runId=None,
        role=role,
        content=content,
        citations=[],
        createdAt=created_at,
        tokenCount=len(content.split()),
    )


async def _collect_events(iterator):
    events = []
    async for event in iterator:
        events.append(event)
    return events


class InMemoryAgentRepository:
    def __init__(self, thread: AgentThread, messages: list[AgentMessage] | None = None):
        self.thread = thread
        self.messages = list(messages or [])
        self.runs = {}
        self.events = []
        self.list_messages_calls = []

    def get_thread(self, user_id: str, thread_id: str):
        if self.thread.userId == user_id and self.thread.id == thread_id:
            return self.thread
        return None

    def update_thread(self, user_id: str, thread_id: str, **patch):
        assert user_id == self.thread.userId
        assert thread_id == self.thread.id
        self.thread = self.thread.model_copy(update=patch)
        return self.thread

    def create_run(self, run):
        self.runs[run.id] = run
        return run

    def get_run(self, thread_id: str, run_id: str):
        run = self.runs.get(run_id)
        if run and run.threadId == thread_id:
            return run
        return None

    def update_run(self, thread_id: str, run_id: str, **patch):
        run = self.get_run(thread_id, run_id)
        if run is None:
            raise LookupError("Run not found")
        updated = run.model_copy(update=patch)
        self.runs[run_id] = updated
        return updated

    def create_message(self, message: AgentMessage):
        self.messages.append(message)
        return message

    def list_messages(self, thread_id: str, limit: int = 100, newest_first: bool = False):
        self.list_messages_calls.append({"thread_id": thread_id, "limit": limit, "newest_first": newest_first})
        messages = [message for message in self.messages if message.threadId == thread_id]
        messages.sort(key=lambda message: message.createdAt, reverse=newest_first)
        return messages[:limit]

    def create_events(self, events):
        self.events.extend(events)
        return events


def test_stream_run_events_emits_terminal_error_for_early_graph_failure(monkeypatch):
    service = AgentService()
    repository = InMemoryAgentRepository(_thread())
    service.repository = repository

    def fail_build_agent_graph(mode: str):
        assert mode == "research"
        raise RuntimeError("graph boom")

    monkeypatch.setattr("app.services.agent.graph.build_agent_graph", fail_build_agent_graph)

    events = asyncio.run(
        _collect_events(
            service.stream_run_events(
                user_id="user-1",
                auth_subject="user-1",
                auth_token="secret-token",
                thread_id="thread-1",
                payload=AgentRunRequest(message="hello", mode="research"),
            )
        )
    )

    assert [event.type for event in events][-1] == "run.error"
    run = next(iter(repository.runs.values()))
    assert run.status == "error"
    assert run.error == "graph boom"
    assert repository.thread.lastRunStatus == "error"


def test_stream_run_events_uses_latest_history_and_runtime_config(monkeypatch):
    service = AgentService()
    repository = InMemoryAgentRepository(
        _thread(),
        messages=[
            _message("m1", "user", "old-1", "2024-01-01T00:00:01Z"),
            _message("m2", "assistant", "old-2", "2024-01-01T00:00:02Z"),
            _message("m3", "user", "old-3", "2024-01-01T00:00:03Z"),
            _message("m4", "assistant", "old-4", "2024-01-01T00:00:04Z"),
            _message("m5", "user", "old-5", "2024-01-01T00:00:05Z"),
        ],
    )
    service.repository = repository
    monkeypatch.setattr(settings, "AGENT_HISTORY_WINDOW", 3)

    capture = {}

    def build_agent_graph(mode: str):
        capture["mode"] = mode

        class FakeGraph:
            async def astream_events(self, graph_state, config, version="v2"):
                capture["messages"] = graph_state["messages"]
                capture["context"] = graph_state["context"]
                capture["config"] = config
                capture["version"] = version
                yield {
                    "event": "on_chat_model_end",
                    "name": "ChatGoogleGenerativeAI",
                    "data": {"output": AIMessage(content="response")},
                }

        return FakeGraph()

    monkeypatch.setattr("app.services.agent.graph.build_agent_graph", build_agent_graph)

    events = asyncio.run(
        _collect_events(
            service.stream_run_events(
                user_id="user-1",
                auth_subject="subject-1",
                auth_token="secret-token",
                thread_id="thread-1",
                payload=AgentRunRequest(message="latest prompt", mode="research"),
            )
        )
    )

    assert capture["mode"] == "research"
    assert capture["version"] == "v2"
    assert repository.list_messages_calls[-1]["newest_first"] is True
    assert [message.content for message in capture["messages"][1:]] == ["old-3", "old-4", "old-5", "latest prompt"]
    assert not hasattr(capture["context"], "user_id")
    assert capture["config"]["configurable"]["runtime"] == {
        "user_id": "user-1",
        "auth_subject": "subject-1",
        "auth_token": "secret-token",
    }
    assert events[-1].type == "run.completed"

import asyncio
from datetime import datetime, timezone

from langchain_core.messages import AIMessage

from app.core.config import settings
from app.models.agent import AgentRunConfig, Citation
from app.services.agent.graph import _assistant_text
from app.services.agent.graph import ConcurrentAgentGraph, WorkerResult, build_worker_specs
from app.services.agent.structured_output import annotate_citation
from app.services.agent.state import AgentRuntimeContext


def _current_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_assistant_text_can_preserve_stream_chunk_whitespace():
    chunk = AIMessage(content=" hello\n\n1. item")

    assert _assistant_text(chunk, trim=False) == " hello\n\n1. item"
    assert _assistant_text(chunk) == "hello\n\n1. item"


async def _noop_emit(event):
    return None


def test_worker_enables_server_tool_invocation_echo(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.services.agent.graph.resolve_skill_prompts", lambda skills: [])
    monkeypatch.setattr("app.services.agent.graph.describe_external_capabilities", lambda capabilities: [])
    monkeypatch.setattr("app.services.agent.graph.get_available_tools", lambda *args, **kwargs: [])
    monkeypatch.setattr("app.services.agent.graph.get_tool_index", lambda *args, **kwargs: {})

    graph = ConcurrentAgentGraph("research", AgentRunConfig())
    capture = {}

    class FakeModel:
        def bind_tools(self, tools, tool_config=None):
            capture["tools"] = tools
            capture["tool_config"] = tool_config
            return self

        async def ainvoke(self, messages, config=None):
            del messages, config
            return AIMessage(content="Worker response")

    monkeypatch.setattr(graph, "_build_model", lambda: FakeModel())

    context = AgentRuntimeContext(mode="research", selected_ticker=None, correlation_id="corr-1")
    worker = build_worker_specs("research", context, AgentRunConfig())[0]
    result = asyncio.run(
        graph._run_worker(
            worker,
            [],
            context,
            {"configurable": {"context": context, "runtime": {"user_id": "user-1"}}},
            _noop_emit,
        )
    )

    assert result.summary == "Worker response"
    assert capture["tool_config"] == {"include_server_side_tool_invocations": True}
    assert any(isinstance(tool, dict) and "google_search" in tool for tool in capture["tools"])


def test_synthesis_completed_includes_structured_output_payload(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    graph = ConcurrentAgentGraph("research", AgentRunConfig())

    class FakeModel:
        async def astream(self, messages):
            del messages
            yield AIMessage(
                content="""
Overview: BPI needs a source-backed follow-up.
Recommendations:
- Recheck BPI after validating the disclosure.
Assumptions:
- Moderate risk tolerance.
Risks:
- Source freshness can change.
Next Steps:
- Run a narrower BPI follow-up.
""".strip()
            )

    monkeypatch.setattr(graph, "_build_model", lambda: FakeModel())

    citation = annotate_citation(
        Citation(label="BPI disclosure", source="company_disclosures", kind="filing", meta={"date": _current_iso()}),
        agent_id="research-lead",
        agent_label="Research Lead",
        tool_name="get_company_disclosures",
    )
    context = AgentRuntimeContext(mode="research", selected_ticker="BPI", correlation_id="corr-1")
    results = [
        WorkerResult(
            agent_id="research-lead",
            label="Research Lead",
            role="research-lead",
            summary="Disclosure review supports follow-up.",
            content="Disclosure review supports follow-up.",
            citations=[citation],
            tool_count=1,
        )
    ]

    async def collect_events():
        return [event async for event in graph._run_synthesis(results, [], context)]

    events = asyncio.run(collect_events())
    completed = next(event for event in events if event["event"] == "synthesis.completed")
    structured_output = completed["data"]["structuredOutput"]

    assert structured_output["summary"] == "BPI needs a source-backed follow-up."
    assert structured_output["sources"][0]["id"] == "S1"
    assert structured_output["recommendations"][0]["supportStatus"] == "supported"
    assert "reliabilityWarnings" in structured_output

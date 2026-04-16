import json

from app.services.agent.streaming import build_sse_event, encode_sse, should_persist_event


def test_encode_sse_includes_standard_envelope():
    event = build_sse_event(
        thread_id="thread-1",
        run_id="run-1",
        sequence=3,
        event_type="message.delta",
        data={"delta": "Hello"},
    )

    encoded = encode_sse(event)

    assert encoded.startswith("event: message.delta\n")
    payload = json.loads(encoded.split("data: ", 1)[1].strip())
    assert payload["threadId"] == "thread-1"
    assert payload["runId"] == "run-1"
    assert payload["sequence"] == 3
    assert payload["type"] == "message.delta"
    assert payload["data"] == {"delta": "Hello"}


def test_should_persist_event_skips_high_volume_stream_chunks():
    assert should_persist_event("message.delta") is False
    assert should_persist_event("heartbeat") is False
    assert should_persist_event("tool.completed") is True

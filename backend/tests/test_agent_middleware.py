from app.services.agent.middleware import derive_thread_title, render_tool_context, should_call_engine, should_call_financials
from app.services.agent.state import ToolOutcome


def test_derive_thread_title_uses_selected_ticker():
    title = derive_thread_title("Explain recent momentum and key risks", "TEL")
    assert title.startswith("TEL /")


def test_should_call_engine_for_trading_mode():
    assert should_call_engine("give me the backdrop", "trading") is True


def test_should_call_financials_detects_financial_language():
    assert should_call_financials("summarize the latest quarterly report") is True


def test_render_tool_context_serializes_payload_as_json():
    rendered = render_tool_context(
        [
            ToolOutcome(
                name="get_market_overview",
                summary="Loaded market overview.",
                payload={"ticker": "TEL", "price": 128.5},
            )
        ]
    )

    assert '"ticker": "TEL"' in rendered
    assert '"price": 128.5' in rendered

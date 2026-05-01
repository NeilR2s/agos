from datetime import datetime, timezone

from app.models.agent import Citation
from app.services.agent.state import AgentRuntimeContext
from app.services.agent.structured_output import annotate_citation, build_structured_output


def _current_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_structured_output_assigns_source_ids_and_agent_metadata():
    context = AgentRuntimeContext(mode="research", selected_ticker="BPI", correlation_id="corr-1")
    citation = annotate_citation(
        Citation(
            label="BPI news item",
            source="news_sentiment_data",
            kind="news",
            href="https://example.com/bpi",
            meta={"date": _current_iso()},
        ),
        agent_id="research-lead",
        agent_label="Research Lead",
        tool_name="get_latest_news",
    )

    output = build_structured_output(
        content="""
Overview: BPI needs a thesis review.
Recommendations:
- Reassess BPI before adding capital.
Assumptions:
- Moderate risk tolerance.
Risks:
- Source freshness can change quickly.
Next Steps:
- Run a focused BPI follow-up.
""".strip(),
        context=context,
        citations=[citation],
        worker_summaries=[
            {
                "agentId": "research-lead",
                "label": "Research Lead",
                "role": "research-lead",
                "summary": "News flow supports reassessing BPI exposure.",
                "toolCount": 1,
            }
        ],
    )

    assert output.summary == "BPI needs a thesis review."
    assert output.sources[0].id == "S1"
    assert output.sources[0].agentId == "research-lead"
    assert output.sources[0].meta["toolName"] == "get_latest_news"
    assert output.evidence[0].sourceIds == ["S1"]
    assert output.recommendations[0].sourceIds == ["S1"]
    assert output.recommendations[0].supportStatus == "supported"
    assert output.executionReady is False


def test_structured_output_falls_back_to_guardrail_assumptions():
    context = AgentRuntimeContext(mode="general", selected_ticker=None, correlation_id="corr-1")

    output = build_structured_output(
        content="AGOS completed the request.",
        context=context,
        citations=[],
        worker_summaries=[],
    )

    assert output.assumptions
    assert any("not execution-ready" in item for item in output.assumptions)
    assert output.evidence[0].confidence == "low"
    assert output.recommendations[0].executionReady is False
    assert output.recommendations[0].supportStatus == "unsupported"
    assert any("No source citations" in warning for warning in output.reliabilityWarnings)


def test_structured_output_keeps_multi_agent_sources_separate():
    context = AgentRuntimeContext(mode="research", selected_ticker="ALI", correlation_id="corr-1")
    research_citation = annotate_citation(
        Citation(label="ALI disclosure", source="company_disclosures", kind="filing", meta={"date": _current_iso()}),
        agent_id="research-lead",
        agent_label="Research Lead",
        tool_name="get_company_disclosures",
    )
    risk_citation = annotate_citation(
        Citation(label="Risk screen", source="market_data", kind="market", meta={"date": _current_iso()}),
        agent_id="risk-sentinel",
        agent_label="Risk Sentinel",
        tool_name="get_market_snapshot",
    )

    output = build_structured_output(
        content="""
Overview: ALI has mixed evidence.
Recommendations:
- Recheck ALI after validating risk.
Assumptions:
- Moderate risk tolerance.
Risks:
- Market conditions can shift.
Next Steps:
- Validate risk before adding exposure.
""".strip(),
        context=context,
        citations=[research_citation, risk_citation],
        worker_summaries=[
            {"agentId": "research-lead", "label": "Research Lead", "role": "research-lead", "summary": "Disclosure review found a catalyst.", "toolCount": 1},
            {"agentId": "risk-sentinel", "label": "Risk Sentinel", "role": "risk-sentinel", "summary": "Risk screen found downside sensitivity.", "toolCount": 1},
        ],
    )

    assert output.evidence[0].sourceIds == ["S1"]
    assert output.evidence[1].sourceIds == ["S2"]
    assert output.recommendations[0].sourceIds == ["S1", "S2"]


def test_structured_output_marks_stale_sources_as_partial_support():
    context = AgentRuntimeContext(mode="research", selected_ticker="TEL", correlation_id="corr-1")
    stale_citation = annotate_citation(
        Citation(label="Old TEL article", source="news_sentiment_data", kind="news", meta={"date": "2024-01-01T00:00:00+00:00"}),
        agent_id="research-lead",
        agent_label="Research Lead",
        tool_name="get_latest_news",
    )

    output = build_structured_output(
        content="""
Overview: TEL requires refreshed evidence.
Recommendations:
- Do not act until the news sweep is refreshed.
Assumptions:
- No liquidity constraints were provided.
Risks:
- News may be stale.
Next Steps:
- Refresh the source set.
""".strip(),
        context=context,
        citations=[stale_citation],
        worker_summaries=[
            {"agentId": "research-lead", "label": "Research Lead", "role": "research-lead", "summary": "Only stale news was available.", "toolCount": 1}
        ],
    )

    assert output.sources[0].freshness == "stale"
    assert output.recommendations[0].supportStatus == "partial"
    assert any("Stale sources" in warning for warning in output.reliabilityWarnings)


def test_structured_output_marks_worker_recommendation_without_sources_unsupported():
    context = AgentRuntimeContext(mode="general", selected_ticker=None, correlation_id="corr-1")

    output = build_structured_output(
        content="""
Overview: The request needs more evidence.
Recommendations:
- Wait for source-backed confirmation.
Assumptions:
- Risk tolerance was not provided.
Risks:
- The finding is not source-linked.
Next Steps:
- Gather source-linked evidence.
""".strip(),
        context=context,
        citations=[],
        worker_summaries=[
            {"agentId": "research-lead", "label": "Research Lead", "role": "research-lead", "summary": "A claim was made without citations.", "toolCount": 0}
        ],
    )

    assert output.evidence[0].sourceIds == []
    assert "Evidence source link was not captured" in output.evidence[0].detail
    assert output.recommendations[0].sourceIds == []
    assert output.recommendations[0].supportStatus == "unsupported"
    assert output.recommendations[0].supportReason == "No source-linked evidence was captured for this recommendation."


def test_structured_output_strips_markdown_from_cards():
    context = AgentRuntimeContext(mode="general", selected_ticker=None, correlation_id="corr-1")

    output = build_structured_output(
        content="""
### Overview: **Ready** state only.
Recommendations:
- **Ticker List:** Provide `BPI` before acting.
Assumptions:
- **Risk Profile:** Undefined.
Risks:
- **Idle Capital:** Opportunity cost.
Next Steps:
- **Input:** Provide holdings.
""".strip(),
        context=context,
        citations=[],
        worker_summaries=[
            {"agentId": "research-lead", "label": "Research Lead", "role": "research-lead", "summary": "**Worker:** no source.", "toolCount": 0}
        ],
    )

    assert "**" not in output.summary
    assert "`" not in output.recommendations[0].title
    assert output.recommendations[0].title == "Ticker List"
    assert output.assumptions[0] == "Risk Profile: Undefined."
    assert output.evidence[0].detail.startswith("Worker: no source.")

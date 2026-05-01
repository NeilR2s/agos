from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Protocol

from app.models.agent import (
    AgentDecisionRow,
    AgentEvidenceItem,
    AgentRecommendation,
    AgentSourceReference,
    AgentStructuredOutput,
    Citation,
)
from app.services.agent.state import AgentRuntimeContext


SECTION_NAMES = {
    "overview": "summary",
    "summary": "summary",
    "evidence": "evidence",
    "recommendation": "recommendations",
    "recommendations": "recommendations",
    "assumption": "assumptions",
    "assumptions": "assumptions",
    "risk": "risks",
    "risks": "risks",
    "next step": "nextSteps",
    "next steps": "nextSteps",
}


class StructuredOutputBuilder(Protocol):
    def build(
        self,
        *,
        content: str,
        context: AgentRuntimeContext,
        citations: list[Citation],
        worker_summaries: list[dict[str, Any]],
    ) -> AgentStructuredOutput: ...


class DeterministicStructuredOutputBuilder:
    def build(
        self,
        *,
        content: str,
        context: AgentRuntimeContext,
        citations: list[Citation],
        worker_summaries: list[dict[str, Any]],
    ) -> AgentStructuredOutput:
        return _build_structured_output(
            content=content,
            context=context,
            citations=citations,
            worker_summaries=worker_summaries,
        )


DEFAULT_STRUCTURED_OUTPUT_BUILDER = DeterministicStructuredOutputBuilder()


def annotate_citation(
    citation: Citation,
    *,
    agent_id: str | None,
    agent_label: str | None,
    tool_name: str | None = None,
) -> Citation:
    meta = dict(citation.meta or {})
    if agent_id and "agentId" not in meta:
        meta["agentId"] = agent_id
    if agent_label and "agentLabel" not in meta:
        meta["agentLabel"] = agent_label
    if tool_name and "toolName" not in meta:
        meta["toolName"] = tool_name
    return citation.model_copy(update={"meta": meta})


def build_structured_output(
    *,
    content: str,
    context: AgentRuntimeContext,
    citations: list[Citation],
    worker_summaries: list[dict[str, Any]],
) -> AgentStructuredOutput:
    return DEFAULT_STRUCTURED_OUTPUT_BUILDER.build(
        content=content,
        context=context,
        citations=citations,
        worker_summaries=worker_summaries,
    )


def _build_structured_output(
    *,
    content: str,
    context: AgentRuntimeContext,
    citations: list[Citation],
    worker_summaries: list[dict[str, Any]],
) -> AgentStructuredOutput:
    sources = build_source_references(citations)
    sections = _extract_sections(content)
    assumptions = _extract_list_section(sections, "assumptions") or _default_assumptions(context)
    risks = _extract_list_section(sections, "risks") or _default_risks(worker_summaries)
    next_steps = _extract_list_section(sections, "nextSteps") or [
        "Review the evidence and run a narrower follow-up before taking portfolio action."
    ]
    evidence = _build_evidence(worker_summaries, sources)
    recommendations = _build_recommendations(sections, evidence, risks, next_steps, sources)
    decision_table = _extract_decision_table(content, sources)
    reliability_warnings = _build_reliability_warnings(sources, evidence, recommendations, decision_table)

    return AgentStructuredOutput(
        summary=_summary_from_content(content, sections),
        assumptions=assumptions,
        risks=risks,
        nextSteps=next_steps,
        reliabilityWarnings=reliability_warnings,
        evidence=evidence,
        recommendations=recommendations,
        decisionTable=decision_table,
        sources=sources,
        executionReady=_is_execution_ready(content),
    )


def build_source_references(citations: list[Citation]) -> list[AgentSourceReference]:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    unique: list[Citation] = []
    seen: set[tuple[str, str, str | None]] = set()
    for citation in citations:
        key = (citation.source, citation.label, citation.href)
        if key in seen:
            continue
        seen.add(key)
        unique.append(citation)

    sources: list[AgentSourceReference] = []
    for index, citation in enumerate(unique, start=1):
        meta = dict(citation.meta or {})
        published_at = _first_string(meta, "publishedAt", "published_at", "published", "date", "asOf", "as_of")
        source_retrieved_at = _first_string(meta, "retrievedAt", "retrieved_at") or retrieved_at
        sources.append(
            AgentSourceReference(
                id=f"S{index}",
                label=citation.label,
                source=citation.source,
                kind=citation.kind,
                href=citation.href,
                excerpt=citation.excerpt,
                publishedAt=published_at,
                retrievedAt=source_retrieved_at,
                freshness=_classify_freshness(published_at),
                agentId=_first_string(meta, "agentId", "agent_id"),
                agentLabel=_first_string(meta, "agentLabel", "agent_label"),
                meta=meta,
            )
        )
    return sources


def _extract_sections(content: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        heading, remainder = _parse_heading(line)
        if heading:
            current = heading
            sections.setdefault(current, [])
            if remainder:
                sections[current].append(remainder)
            continue

        if current:
            sections.setdefault(current, []).append(line)
    return sections


def _parse_heading(line: str) -> tuple[str | None, str]:
    normalized = re.sub(r"^#{1,6}\s*", "", line).strip()
    match = re.match(r"^(overview|summary|evidence|recommendations?|assumptions?|risks?|next steps?)\s*:?\s*(.*)$", normalized, re.I)
    if not match:
        return None, ""
    key = SECTION_NAMES[match.group(1).strip().lower()]
    return key, match.group(2).strip()


def _extract_list_section(sections: dict[str, list[str]], key: str) -> list[str]:
    values: list[str] = []
    for line in sections.get(key, []):
        cleaned = _clean_bullet(line)
        if cleaned and not _looks_like_table_line(cleaned):
            values.append(cleaned)
    return values[:8]


def _summary_from_content(content: str, sections: dict[str, list[str]]) -> str:
    summary_lines = [_clean_bullet(line) for line in sections.get("summary", [])]
    summary = " ".join(line for line in summary_lines if line and not _looks_like_table_line(line)).strip()
    if summary:
        return _shorten(summary, 360)

    for line in content.splitlines():
        cleaned = _clean_bullet(line.strip())
        if cleaned and not _looks_like_table_line(cleaned) and not _parse_heading(cleaned)[0]:
            return _shorten(cleaned, 360)
    return "AGOS completed the run and produced an operator memo."


def _build_evidence(worker_summaries: list[dict[str, Any]], sources: list[AgentSourceReference]) -> list[AgentEvidenceItem]:
    evidence: list[AgentEvidenceItem] = []
    sources_by_id = {source.id: source for source in sources}
    sources_by_agent: dict[str, list[str]] = {}
    unattributed_sources: list[str] = []
    for source in sources:
        if source.agentId:
            sources_by_agent.setdefault(source.agentId, []).append(source.id)
        else:
            unattributed_sources.append(source.id)

    for index, summary in enumerate(worker_summaries, start=1):
        agent_id = str(summary.get("agentId") or "")
        label = str(summary.get("label") or agent_id or f"Worker {index}")
        detail = str(summary.get("summary") or "No summary emitted.").strip()
        linked_sources = sources_by_agent.get(agent_id, [])
        if not linked_sources and len(worker_summaries) == 1:
            linked_sources = unattributed_sources[:3]
        if not linked_sources:
            detail = f"{detail} Evidence source link was not captured for this worker."
        evidence.append(
            AgentEvidenceItem(
                id=f"E{index}",
                claim=f"{label} finding",
                detail=_shorten(detail, 420),
                confidence=_evidence_confidence(linked_sources, sources_by_id),
                sourceIds=linked_sources,
                agentIds=[agent_id] if agent_id else [],
            )
        )

    if not evidence:
        evidence.append(
            AgentEvidenceItem(
                id="E1",
                claim="Synthesis finding",
                detail="AGOS produced a consolidated answer, but no worker-level evidence summary was captured.",
                confidence="medium" if sources else "low",
                sourceIds=[source.id for source in sources[:3]],
            )
        )
    return evidence


def _build_recommendations(
    sections: dict[str, list[str]],
    evidence: list[AgentEvidenceItem],
    risks: list[str],
    next_steps: list[str],
    sources: list[AgentSourceReference],
) -> list[AgentRecommendation]:
    candidates = _extract_list_section(sections, "recommendations")
    if not candidates:
        candidates = next_steps[:1]

    recommendations: list[AgentRecommendation] = []
    for index, candidate in enumerate(candidates[:6], start=1):
        linked_evidence = [item for item in evidence if item.sourceIds]
        selected_evidence = (linked_evidence or evidence)[:3]
        evidence_ids = [item.id for item in selected_evidence]
        source_ids = _dedupe_source_ids([source_id for item in selected_evidence for source_id in item.sourceIds])
        support_status, support_reason = _recommendation_support(selected_evidence, source_ids, sources)
        recommendations.append(
            AgentRecommendation(
                id=f"R{index}",
                title=_recommendation_title(candidate, index),
                rationale=_shorten(candidate, 520),
                confidence="medium" if source_ids else "low",
                risk=risks[min(index - 1, len(risks) - 1)] if risks else "Execution risk remains unvalidated.",
                nextAction=(
                    next_steps[min(index - 1, len(next_steps) - 1)]
                    if source_ids and next_steps
                    else "Gather source-linked evidence before acting on this recommendation."
                ),
                evidenceIds=evidence_ids,
                sourceIds=source_ids,
                executionReady=False,
                supportStatus=support_status,
                supportReason=support_reason,
            )
        )
    return recommendations


def _extract_decision_table(content: str, sources: list[AgentSourceReference]) -> list[AgentDecisionRow]:
    lines = [line.strip() for line in content.splitlines() if line.strip().startswith("|")]
    source_ids = [source.id for source in sources[:3]]
    for index, line in enumerate(lines[:-2]):
        headers = [_normalize_table_cell(cell) for cell in line.strip("|").split("|")]
        header_lookup = {header.lower(): offset for offset, header in enumerate(headers)}
        required = {"holding", "status", "finding"}
        if not required.issubset(header_lookup):
            continue
        separator = lines[index + 1]
        if not re.match(r"^\|?\s*:?-{3,}:?", separator):
            continue

        rows: list[AgentDecisionRow] = []
        for row_line in lines[index + 2 :]:
            cells = [_normalize_table_cell(cell) for cell in row_line.strip("|").split("|")]
            if len(cells) < len(headers):
                break
            rows.append(
                AgentDecisionRow(
                    holding=_cell(cells, header_lookup, "holding", "--"),
                    status=_cell(cells, header_lookup, "status", "--"),
                    finding=_cell(cells, header_lookup, "finding", "--"),
                    suggestedAction=_cell(cells, header_lookup, "suggested action", _cell(cells, header_lookup, "action", "Review")),
                    confidence=_normalize_confidence(_cell(cells, header_lookup, "confidence", "medium")),
                    sourceIds=source_ids,
                )
            )
        return rows[:12]
    return []


def _default_assumptions(context: AgentRuntimeContext) -> list[str]:
    target = context.selected_ticker or "the current portfolio/context"
    return [
        f"Analysis applies to {target} in {context.mode} mode.",
        "Risk tolerance was not explicitly provided.",
        "Liquidity needs were not explicitly provided.",
        "Recommendations are advisory and not execution-ready.",
    ]


def _default_risks(worker_summaries: list[dict[str, Any]]) -> list[str]:
    for summary in worker_summaries:
        role = str(summary.get("role") or "")
        text = str(summary.get("summary") or "").strip()
        if "risk" in role and text:
            return [_shorten(text, 320)]
    return ["Source freshness, suitability, and execution constraints must be verified before action."]


def _evidence_confidence(source_ids: list[str], sources_by_id: dict[str, AgentSourceReference]) -> str:
    if not source_ids:
        return "low"
    linked_sources = [sources_by_id[source_id] for source_id in source_ids if source_id in sources_by_id]
    if linked_sources and all(source.freshness in {"current", "recent"} for source in linked_sources):
        return "high"
    return "medium"


def _recommendation_support(
    evidence: list[AgentEvidenceItem],
    source_ids: list[str],
    sources: list[AgentSourceReference],
) -> tuple[str, str | None]:
    if not evidence:
        return "unsupported", "No evidence item was captured for this recommendation."
    if not source_ids:
        return "unsupported", "No source-linked evidence was captured for this recommendation."

    sources_by_id = {source.id: source for source in sources}
    linked_sources = [sources_by_id[source_id] for source_id in source_ids if source_id in sources_by_id]
    has_freshness_gap = any(source.freshness in {"stale", "unknown"} for source in linked_sources)
    has_low_evidence = any(item.confidence == "low" for item in evidence)
    if has_freshness_gap or has_low_evidence:
        return "partial", "Evidence is source-linked, but freshness or confidence needs verification."
    return "supported", None


def _build_reliability_warnings(
    sources: list[AgentSourceReference],
    evidence: list[AgentEvidenceItem],
    recommendations: list[AgentRecommendation],
    decision_table: list[AgentDecisionRow],
) -> list[str]:
    warnings: list[str] = []
    if not sources:
        warnings.append("No source citations were captured; recommendations are unsupported until evidence is gathered.")

    stale_sources = [source.id for source in sources if source.freshness == "stale"]
    if stale_sources:
        warnings.append(f"Stale sources require refresh before action: {', '.join(stale_sources[:6])}.")

    unknown_sources = [source.id for source in sources if source.freshness == "unknown"]
    if unknown_sources:
        warnings.append(f"Source freshness is unknown for: {', '.join(unknown_sources[:6])}.")

    unlinked_evidence = [item.id for item in evidence if not item.sourceIds]
    if unlinked_evidence:
        warnings.append(f"Evidence items without source links: {', '.join(unlinked_evidence[:6])}.")

    unsupported = [item.id for item in recommendations if item.supportStatus == "unsupported"]
    if unsupported:
        warnings.append(f"Unsupported recommendations: {', '.join(unsupported[:6])}.")

    partial = [item.id for item in recommendations if item.supportStatus == "partial"]
    if partial:
        warnings.append(f"Partially supported recommendations need freshness or confidence checks: {', '.join(partial[:6])}.")

    if any(not row.sourceIds for row in decision_table):
        warnings.append("One or more decision rows have no source link.")

    return warnings[:8]


def _first_string(values: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = values.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _classify_freshness(value: str | None) -> str:
    if not value:
        return "unknown"
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return "unknown"

    age_days = (datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).days
    if age_days <= 1:
        return "current"
    if age_days <= 7:
        return "recent"
    if age_days <= 31:
        return "moderate"
    return "stale"


def _clean_bullet(line: str) -> str:
    cleaned = re.sub(r"^[-*•]\s+", "", line.strip())
    cleaned = re.sub(r"^\d+[.)]\s+", "", cleaned)
    return _strip_markdown(cleaned).strip()


def _looks_like_table_line(line: str) -> bool:
    return line.startswith("|") or bool(re.match(r"^:?-{3,}:?", line))


def _recommendation_title(text: str, index: int) -> str:
    title = re.split(r"[.;:]", text, maxsplit=1)[0].strip()
    return _shorten(title or f"Recommendation {index}", 96)


def _dedupe_source_ids(source_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for source_id in source_ids:
        if source_id in seen:
            continue
        seen.add(source_id)
        ordered.append(source_id)
    return ordered


def _normalize_table_cell(value: str) -> str:
    return _strip_markdown(value).strip().strip("`*")


def _cell(cells: list[str], lookup: dict[str, int], key: str, fallback: str) -> str:
    index = lookup.get(key)
    if index is None or index >= len(cells):
        return fallback
    return cells[index] or fallback


def _normalize_confidence(value: str) -> str:
    lowered = value.lower()
    if "high" in lowered:
        return "high"
    if "low" in lowered:
        return "low"
    return "medium"


def _is_execution_ready(content: str) -> bool:
    lowered = content.lower()
    return "execution-ready" in lowered and "not execution-ready" not in lowered and "non-execution-ready" not in lowered


def _shorten(text: str, limit: int) -> str:
    normalized = " ".join(_strip_markdown(text).split()).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def _strip_markdown(text: str) -> str:
    cleaned = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    cleaned = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)
    return cleaned

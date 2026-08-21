from __future__ import annotations

from langchain_core.messages import BaseMessage, SystemMessage

from app.models.agent import AgentMessage
from app.services.agent.state import AgentRuntimeContext, ToolOutcome


SYSTEM_PROMPT_TEMPLATE = (
    "You are AGOS, an institutional research and trading copilot. "
    "Do not fabricate tools, citations, prices, or holdings. "
    "Never claim to have hidden reasoning; report only observable reasoning summaries. "
    "Separate facts, evidence, and inference clearly. "
    "If engine output is present, treat the engine as the trade-evaluation authority. "
    "Keep answers concise, operator-facing, and actionable. "
    "Always state suitability assumptions when providing capital allocation advice. "
    "Current mode: {mode}. Selected ticker: {selected_ticker}."
)

TITLE_PROMPT_TEMPLATE = (
    "Generate a short 3-5 word title for a chat thread that starts with this user message:\n"
    "{message}\n"
    "Return only the title, with no quotes or prefix."
)

WORKER_MEMO_INSTRUCTION = (
    "Return a concise operator memo. Separate evidence from inference. "
    "Use tools when they improve confidence, not by default."
)

SYNTHESIS_SYSTEM_TEMPLATE = (
    "{global_prompt}\n\n"
    "You are the AGOS synthesis agent. Combine worker outputs into one answer. "
    "Keep the result crisp, operator-facing, and faithful to evidence. "
    "Present sections for Overview, Evidence, Recommendations, Assumptions, Risks, and Next Steps. "
    "Always include an Assumptions block detailing presumed risk tolerance, horizon, and liquidity needs. "
    "Frame recommendations as advisory and not execution-ready unless an execution guard explicitly approved it. "
    "Current mode: {mode}. Selected ticker: {selected_ticker}."
)

RESPONDER_PROMPT_TEMPLATE = (
    "System instructions:\n{system_prompt}\n\n"
    "Conversation history:\n{history}\n\n"
    "Latest operator request:\n{latest_user_message}\n\n"
    "Selected ticker: {selected_ticker}\n"
    "Mode: {mode}\n\n"
    "Structured tool context:\n{tool_context}\n\n"
    "Respond with short sections for Overview, Evidence, Inference, and Next Step."
)

DETERMINISTIC_FALLBACK_ASSESSMENT = (
    "Use the evidence summary as the current operating picture. If you need a deeper answer, "
    "configure DeepSeek so AGOS can synthesize tool results into a richer narrative."
)

MODEL_NOT_CONFIGURED_WORKER_SUMMARY = "DeepSeek is not configured, so AGOS could not run this worker."
MODEL_NOT_CONFIGURED_WORKER_CONTENT = "Configure DEEPSEEK_API_KEY to enable multi-agent execution."
MODEL_NOT_CONFIGURED_FINAL = (
    "DeepSeek is not configured. Configure DEEPSEEK_API_KEY to enable AGOS multi-agent reasoning, traces, and synthesis."
)
NO_MODEL_OUTPUT = "No model output was returned for this run. Review the trace and retry once the model connection is stable."


def stringify_message_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def build_system_prompt(context: AgentRuntimeContext) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        mode=context.mode,
        selected_ticker=context.selected_ticker or "none",
    )


def build_title_prompt(message: str) -> str:
    return TITLE_PROMPT_TEMPLATE.format(message=message.strip())


def build_responder_prompt(
    *,
    system_prompt: str,
    latest_user_message: str,
    history: list[AgentMessage],
    tool_outcomes: list[ToolOutcome],
    context: AgentRuntimeContext,
    history_block: str,
    tool_context: str,
) -> str:
    del history, tool_outcomes
    return RESPONDER_PROMPT_TEMPLATE.format(
        system_prompt=system_prompt,
        history=history_block,
        latest_user_message=latest_user_message.strip(),
        selected_ticker=context.selected_ticker or "none",
        mode=context.mode,
        tool_context=tool_context,
    )


def global_system_prompt(base_messages: list[BaseMessage]) -> str:
    if base_messages and isinstance(base_messages[0], SystemMessage):
        return stringify_message_content(base_messages[0].content)
    return ""


def build_worker_prompt(
    *,
    base_messages: list[BaseMessage],
    selected_ticker: str | None,
    mode: str,
    worker_label: str,
    worker_instruction: str,
    skill_prompts: list[str],
    capability_notes: list[str],
) -> str:
    sections = [
        global_system_prompt(base_messages),
        f"You are {worker_label} inside AGOS.",
        worker_instruction,
        f"Selected ticker: {selected_ticker or 'none'}. Mode: {mode}.",
    ]
    if skill_prompts:
        sections.append("Active AGOS skills:\n- " + "\n- ".join(skill_prompts))
    if capability_notes:
        sections.append("External capability status:\n- " + "\n- ".join(capability_notes))
    sections.append(WORKER_MEMO_INSTRUCTION)
    return "\n\n".join(section for section in sections if section)


def build_synthesis_system_prompt(base_messages: list[BaseMessage], context: AgentRuntimeContext) -> str:
    return SYNTHESIS_SYSTEM_TEMPLATE.format(
        global_prompt=global_system_prompt(base_messages),
        mode=context.mode,
        selected_ticker=context.selected_ticker or "none",
    )


def build_synthesis_prompt(worker_sections: list[str], context: AgentRuntimeContext) -> str:
    sections = [
        f"Selected ticker: {context.selected_ticker or 'none'}",
        f"Mode: {context.mode}",
        "Worker outputs:",
        *worker_sections,
        "Write a single final answer for the operator. Make tool/model activity invisible unless it directly matters.",
    ]
    return "\n\n".join(sections)


def build_fallback_synthesis(worker_summaries: list[str], context: AgentRuntimeContext) -> str:
    lines = [
        f"Overview: AGOS completed a {context.mode} pass for {context.selected_ticker or 'the current context'}.",
        "Evidence:",
        *worker_summaries,
        "Next Step:",
        "- Review the consolidated evidence and decide whether a deeper rerun or narrower follow-up is needed.",
        "Assumptions:",
        "- Risk tolerance, liquidity needs, and tax constraints were not explicitly provided.",
        "- Recommendations are advisory and not execution-ready.",
        "Risks:",
        "- Source freshness and execution constraints must be verified before action.",
    ]
    return "\n".join(lines)

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, AsyncIterator, Awaitable, Callable

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage

from app.core.config import settings
from app.models.agent import AgentRunConfig, Citation
from app.services.agent.configuration import resolve_model_profile
from app.services.agent.skills import resolve_skill_prompts
from app.services.agent.state import AgentRuntimeContext
from app.services.agent.structured_output import annotate_citation, build_structured_output
from app.services.agent.tools.registry import (
    SERVER_TOOL_LABELS,
    describe_external_capabilities,
    get_available_tools,
    get_server_tools,
    get_tool_index,
)


RuntimeEvent = dict[str, Any]
EmitFn = Callable[[RuntimeEvent], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class WorkerSpec:
    agent_id: str
    label: str
    role: str
    instruction: str
    tool_role: str
    built_in_tools: tuple[str, ...] = ()


@dataclass(slots=True)
class WorkerResult:
    agent_id: str
    label: str
    role: str
    summary: str
    content: str
    citations: list[Citation]
    tool_count: int
    status: str = "completed"


def _stringify_message_content(content: object) -> str:
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


def _content_blocks(message: BaseMessage) -> list[dict[str, Any]]:
    blocks = getattr(message, "content_blocks", None)
    if isinstance(blocks, list):
        return [block for block in blocks if isinstance(block, dict)]
    content = getattr(message, "content", None)
    if isinstance(content, list):
        return [block for block in content if isinstance(block, dict)]
    return []


def _assistant_text(message: BaseMessage, *, trim: bool = True) -> str:
    blocks = _content_blocks(message)
    text_parts = [block.get("text", "") for block in blocks if block.get("type") == "text" and isinstance(block.get("text"), str)]
    if text_parts:
        text = "".join(text_parts)
        return text.strip() if trim else text
    text = _stringify_message_content(getattr(message, "content", ""))
    return text.strip() if trim else text


def _shorten(text: str, limit: int = 220) -> str:
    normalized = " ".join(text.split()).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def _dedupe_citations(citations: list[Citation]) -> list[Citation]:
    seen: set[tuple[str, str, str | None]] = set()
    unique: list[Citation] = []
    for citation in citations:
        key = (citation.source, citation.label, citation.href)
        if key in seen:
            continue
        seen.add(key)
        unique.append(citation)
    return unique


def _grounding_citations(message: BaseMessage) -> list[Citation]:
    response_metadata = getattr(message, "response_metadata", {}) or {}
    grounding = response_metadata.get("grounding_metadata")
    if not isinstance(grounding, dict):
        return []

    queries = grounding.get("web_search_queries")
    grounding_chunks = grounding.get("grounding_chunks")
    citations: list[Citation] = []
    if isinstance(grounding_chunks, list):
        for index, chunk in enumerate(grounding_chunks[:6]):
            if not isinstance(chunk, dict):
                continue
            web = chunk.get("web")
            if not isinstance(web, dict):
                continue
            href = web.get("uri") if isinstance(web.get("uri"), str) else None
            title = web.get("title") if isinstance(web.get("title"), str) and web.get("title") else f"Grounding source {index + 1}"
            citations.append(
                Citation(
                    label=title,
                    source="google_grounding",
                    kind="reference",
                    href=href,
                    meta={"queries": queries if isinstance(queries, list) else []},
                )
            )
    return citations


def _tool_citations(output: object) -> list[Citation]:
    if not isinstance(output, dict):
        return []
    raw_citations = output.get("citations")
    if not isinstance(raw_citations, list):
        return []
    citations: list[Citation] = []
    for item in raw_citations:
        if not isinstance(item, dict):
            continue
        try:
            citations.append(Citation(**item))
        except Exception:
            continue
    return citations


def _tool_summary(output: object) -> str:
    if isinstance(output, dict):
        summary = output.get("summary")
        if isinstance(summary, str) and summary.strip():
            return summary.strip()
    return "Tool execution complete."


def _format_tool_args(args: object) -> str:
    if not args:
        return ""
    if isinstance(args, str):
        return _shorten(args, limit=120)
    if isinstance(args, dict):
        compact = ", ".join(f"{key}={value}" for key, value in list(args.items())[:4])
        return _shorten(compact, limit=120)
    return _shorten(str(args), limit=120)


def _role_instructions(mode: str, selected_ticker: str | None) -> list[WorkerSpec]:
    ticker_line = selected_ticker or "the active operating context"
    shared = [
        WorkerSpec(
            agent_id="research-lead",
            label="Research Lead",
            role="research-lead",
            tool_role="research-lead",
            built_in_tools=("google_search", "url_context"),
            instruction=(
                f"Own the primary evidence sweep for {ticker_line}. Resolve what matters, what changed, and what still needs verification. "
                "Use first-party tools first, then fall back to grounded web retrieval only when necessary."
            ),
        ),
        WorkerSpec(
            agent_id="portfolio-analyst",
            label="Portfolio Analyst",
            role="portfolio-analyst",
            tool_role="portfolio-analyst",
            built_in_tools=(),
            instruction=(
                "Anchor the answer to the operator's current exposure, overlap, concentration, and position context. "
                "Call out what the portfolio already owns or lacks."
            ),
        ),
        WorkerSpec(
            agent_id="web-investigator",
            label="Web Investigator",
            role="web-investigator",
            tool_role="web-investigator",
            built_in_tools=("google_search", "url_context"),
            instruction=(
                "Use grounded web retrieval to validate freshness, external references, and URL-specific claims. "
                "Report only observable facts and source-backed findings."
            ),
        ),
        WorkerSpec(
            agent_id="risk-sentinel",
            label="Risk Sentinel",
            role="risk-sentinel",
            tool_role="risk-sentinel",
            built_in_tools=("google_search", "code_execution"),
            instruction=(
                "Stress-test the thesis, surface hidden risk, and quantify edge cases when code execution would materially improve the answer. "
                "Do not produce a trade directive without explicit evidence."
            ),
        ),
    ]

    if mode == "trading":
        shared.append(
            WorkerSpec(
                agent_id="execution-guard",
                label="Execution Guard",
                role="execution-guard",
                tool_role="execution-guard",
                built_in_tools=("code_execution",),
                instruction=(
                    "Translate validated evidence into an execution-minded read. Use the engine when available, quantify risk, and keep the output decision-aware."
                ),
            )
        )
    return shared


def build_worker_specs(mode: str, context: AgentRuntimeContext, run_config: AgentRunConfig) -> list[WorkerSpec]:
    ordered = _role_instructions(mode, context.selected_ticker)
    specs: list[WorkerSpec] = []
    for candidate in ordered:
        if len(specs) >= run_config.maxAgents:
            break
        if candidate.role == "portfolio-analyst" and not run_config.tools.portfolio:
            continue
        if candidate.role == "web-investigator" and not (run_config.tools.research or run_config.tools.webSearch or run_config.tools.urlContext):
            continue
        if candidate.role == "risk-sentinel" and not (run_config.tools.market or run_config.tools.engine or run_config.tools.codeExecution):
            continue
        if candidate.role == "execution-guard" and not (mode == "trading" and run_config.tools.engine):
            continue
        specs.append(candidate)
    if not specs:
        specs.append(ordered[0])
    return specs


class ConcurrentAgentGraph:
    def __init__(self, mode: str, run_config: AgentRunConfig):
        self.mode = mode
        self.run_config = run_config
        self.model_profile = resolve_model_profile(run_config)

    def _build_model(self):
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=self.model_profile.model,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=self.run_config.temperature,
            top_p=self.run_config.topP,
            max_output_tokens=self.run_config.maxOutputTokens,
            max_retries=2,
            thinking_level=self.run_config.thinkingLevel,
        )

    async def astream_events(self, graph_state: dict[str, Any], config: dict[str, Any], version: str = "v2") -> AsyncIterator[RuntimeEvent]:
        del version
        context: AgentRuntimeContext = graph_state["context"]
        base_messages: list[BaseMessage] = list(graph_state["messages"])
        worker_specs = build_worker_specs(self.mode, context, self.run_config)

        if not settings.GEMINI_API_KEY:
            worker_summaries = [
                {
                    "agentId": spec.agent_id,
                    "label": spec.label,
                    "role": spec.role,
                    "summary": "Gemini is not configured, so AGOS could not run this worker.",
                    "toolCount": 0,
                }
                for spec in worker_specs
            ]
            for spec in worker_specs:
                yield {
                    "event": "agent.started",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {"detail": f"{spec.label} is offline because Gemini is not configured."},
                }
                yield {
                    "event": "agent.completed",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {
                        "status": "completed",
                        "summary": "Gemini is not configured, so AGOS could not run this worker.",
                        "content": "Configure GEMINI_API_KEY to enable multi-agent execution.",
                        "toolCount": 0,
                    },
                }
            fallback = "Gemini is not configured. Configure GEMINI_API_KEY to enable AGOS multi-agent reasoning, traces, and synthesis."
            yield {
                "event": "agent.started",
                "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
                "data": {"detail": "Producing deterministic fallback output."},
            }
            yield {"event": "message.delta", "data": {"delta": fallback}, "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"}}
            yield {
                "event": "synthesis.completed",
                "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
                "data": {
                    "content": fallback,
                    "citations": [],
                    "workerSummaries": worker_summaries,
                    "agentCount": len(worker_specs),
                    "structuredOutput": build_structured_output(
                        content=fallback,
                        context=context,
                        citations=[],
                        worker_summaries=worker_summaries,
                    ).model_dump(mode="json"),
                },
            }
            return

        queue: asyncio.Queue[RuntimeEvent] = asyncio.Queue()

        async def emit(event: RuntimeEvent) -> None:
            await queue.put(event)

        tasks = [
            asyncio.create_task(self._run_worker(spec, base_messages, context, config, emit))
            for spec in worker_specs
        ]

        try:
            pending = set(tasks)
            while pending:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.05)
                    yield event
                except TimeoutError:
                    pass
                pending = {task for task in tasks if not task.done()}

            while not queue.empty():
                yield await queue.get()

            results = [await task for task in tasks]
            async for event in self._run_synthesis(results, base_messages, context):
                yield event
        finally:
            pending_tasks = [task for task in tasks if not task.done()]
            for task in pending_tasks:
                task.cancel()
            if pending_tasks:
                await asyncio.gather(*pending_tasks, return_exceptions=True)

    async def _run_worker(
        self,
        spec: WorkerSpec,
        base_messages: list[BaseMessage],
        context: AgentRuntimeContext,
        runnable_config: dict[str, Any],
        emit: EmitFn,
    ) -> WorkerResult:
        await emit(
            {
                "event": "agent.started",
                "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                "data": {"detail": f"{spec.label} is taking point."},
            }
        )

        try:
            skill_prompts = resolve_skill_prompts(self.run_config.skills)
            capability_notes = describe_external_capabilities(self.run_config.externalCapabilities)
            tools = get_available_tools(self.mode, tool_settings=self.run_config.tools, role=spec.tool_role)
            tool_index = get_tool_index(self.mode, tool_settings=self.run_config.tools, role=spec.tool_role)
            server_tools = [tool_def for tool_def in get_server_tools(self.run_config.tools) if next(iter(tool_def)) in spec.built_in_tools]
            tool_config = {"include_server_side_tool_invocations": True} if server_tools else None

            system_prompt = self._worker_prompt(base_messages, context, spec, skill_prompts, capability_notes)
            messages: list[BaseMessage] = [SystemMessage(content=system_prompt), *self._conversation_messages(base_messages)]
            model = self._build_model()
            if tools or server_tools:
                model = model.bind_tools([*tools, *server_tools], tool_config=tool_config)

            all_citations: list[Citation] = []
            tool_count = 0
            assistant_text = ""

            for step in range(1, 7):
                await emit(
                    {
                        "event": "reasoning.step",
                        "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                        "data": {
                            "title": f"{spec.label} pass {step}",
                            "detail": _shorten(f"{spec.label} is reviewing evidence and deciding the next move.", limit=140),
                        },
                    }
                )

                response: AIMessage = await model.ainvoke(messages, config=runnable_config)
                messages.append(response)

                for block in _content_blocks(response):
                    block_type = block.get("type")
                    if block_type == "reasoning" and isinstance(block.get("text"), str):
                        await emit(
                            {
                                "event": "reasoning.step",
                                "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                "data": {
                                    "title": spec.label,
                                    "detail": _shorten(block["text"], limit=180),
                                },
                            }
                        )
                    elif block_type == "server_tool_call":
                        name = str(block.get("name") or "server_tool")
                        await emit(
                            {
                                "event": "tool.started",
                                "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                "data": {
                                    "name": name,
                                    "detail": f"{spec.label} invoked {SERVER_TOOL_LABELS.get(name, name.replace('_', ' '))}.",
                                    "args": block.get("args") if isinstance(block.get("args"), dict) else {},
                                    "serverTool": True,
                                },
                            }
                        )
                    elif block_type == "server_tool_result":
                        name = str(block.get("name") or "server_tool")
                        output = block.get("output") if isinstance(block.get("output"), str) else "Server tool completed."
                        await emit(
                            {
                                "event": "tool.completed",
                                "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                "data": {
                                    "name": name,
                                    "summary": _shorten(output or "Server tool completed.", limit=180),
                                    "serverTool": True,
                                },
                            }
                        )

                for citation in _grounding_citations(response):
                    enriched_citation = annotate_citation(
                        citation,
                        agent_id=spec.agent_id,
                        agent_label=spec.label,
                        tool_name="google_grounding",
                    )
                    all_citations.append(enriched_citation)
                    await emit(
                        {
                            "event": "citation.added",
                            "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                            "data": {"citation": enriched_citation.model_dump(mode="json")},
                        }
                    )

                tool_calls = getattr(response, "tool_calls", None) or []
                if tool_calls:
                    for tool_call in tool_calls:
                        tool_name = str(tool_call.get("name") or "tool")
                        tool_args = tool_call.get("args") or {}
                        await emit(
                            {
                                "event": "tool.started",
                                "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                "data": {
                                    "name": tool_name,
                                    "detail": f"{spec.label} invoked {tool_name}.",
                                    "args": tool_args if isinstance(tool_args, dict) else {},
                                },
                            }
                        )
                        if tool_name not in tool_index:
                            error_text = f"Tool {tool_name} is not available to {spec.label}."
                            await emit(
                                {
                                    "event": "tool.error",
                                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                    "data": {"name": tool_name, "error": error_text},
                                }
                            )
                            messages.append(ToolMessage(content=error_text, tool_call_id=str(tool_call.get("id") or tool_name), name=tool_name))
                            continue

                        try:
                            output = await tool_index[tool_name].ainvoke(tool_args, config=runnable_config)
                            tool_count += 1
                            for citation in _tool_citations(output):
                                enriched_citation = annotate_citation(
                                    citation,
                                    agent_id=spec.agent_id,
                                    agent_label=spec.label,
                                    tool_name=tool_name,
                                )
                                all_citations.append(enriched_citation)
                                await emit(
                                    {
                                        "event": "citation.added",
                                        "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                        "data": {"citation": enriched_citation.model_dump(mode="json")},
                                    }
                                )
                            await emit(
                                {
                                    "event": "tool.completed",
                                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                    "data": {
                                        "name": tool_name,
                                        "summary": _tool_summary(output),
                                        "riskFlags": output.get("risk_flags", []) if isinstance(output, dict) else [],
                                    },
                                }
                            )
                            messages.append(
                                ToolMessage(
                                    content=json.dumps(output, ensure_ascii=True, default=str),
                                    tool_call_id=str(tool_call.get("id") or tool_name),
                                    name=tool_name,
                                )
                            )
                        except Exception as exc:
                            error_text = str(exc)
                            await emit(
                                {
                                    "event": "tool.error",
                                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                                    "data": {"name": tool_name, "error": error_text},
                                }
                            )
                            messages.append(ToolMessage(content=error_text, tool_call_id=str(tool_call.get("id") or tool_name), name=tool_name))
                    continue

                assistant_text = _assistant_text(response)
                if assistant_text:
                    break

            if not assistant_text:
                assistant_text = f"{spec.label} completed without a narrative response. Review the trace for structured outputs."

            citations = _dedupe_citations(all_citations)
            summary = _shorten(assistant_text, limit=180)
            await emit(
                {
                    "event": "agent.completed",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {
                        "status": "completed",
                        "summary": summary,
                        "content": assistant_text,
                        "toolCount": tool_count,
                        "citationCount": len(citations),
                    },
                }
            )
            return WorkerResult(
                agent_id=spec.agent_id,
                label=spec.label,
                role=spec.role,
                summary=summary,
                content=assistant_text,
                citations=citations,
                tool_count=tool_count,
            )
        except Exception as exc:
            error_text = str(exc)
            await emit(
                {
                    "event": "tool.error",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {"name": "agent_runtime", "error": error_text},
                }
            )
            await emit(
                {
                    "event": "agent.completed",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {
                        "status": "error",
                        "summary": _shorten(error_text, limit=180),
                        "content": error_text,
                        "toolCount": 0,
                        "citationCount": 0,
                    },
                }
            )
            return WorkerResult(
                agent_id=spec.agent_id,
                label=spec.label,
                role=spec.role,
                summary=_shorten(error_text, limit=180),
                content=error_text,
                citations=[],
                tool_count=0,
                status="error",
            )

    async def _run_synthesis(
        self,
        results: list[WorkerResult],
        base_messages: list[BaseMessage],
        context: AgentRuntimeContext,
    ) -> AsyncIterator[RuntimeEvent]:
        yield {
            "event": "agent.started",
            "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
            "data": {"detail": f"Combining {len(results)} agent perspectives into the final operator answer."},
        }
        yield {
            "event": "reasoning.step",
            "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
            "data": {"title": "Synthesis", "detail": "AGOS is reconciling agent outputs into a single response."},
        }

        all_citations = _dedupe_citations([citation for result in results for citation in result.citations])
        final_content = ""
        try:
            prompt = self._synthesis_prompt(results, context)
            model = self._build_model()
            messages: list[BaseMessage] = [SystemMessage(content=self._synthesis_system_prompt(base_messages, context)), HumanMessage(content=prompt)]

            chunks: list[str] = []
            async for chunk in model.astream(messages):
                delta = _assistant_text(chunk, trim=False)
                if not delta:
                    continue
                chunks.append(delta)
                yield {
                    "event": "message.delta",
                    "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
                    "data": {"delta": delta},
                }
            final_content = "".join(chunks).strip()
        except Exception:
            final_content = ""

        if not final_content:
            final_content = self._fallback_synthesis(results, context)

        worker_summaries = [
            {
                "agentId": result.agent_id,
                "label": result.label,
                "role": result.role,
                "summary": result.summary,
                "toolCount": result.tool_count,
            }
            for result in results
        ]
        structured_output = build_structured_output(
            content=final_content,
            context=context,
            citations=all_citations,
            worker_summaries=worker_summaries,
        )

        yield {
            "event": "agent.completed",
            "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
            "data": {
                "status": "completed",
                "summary": _shorten(final_content, limit=180),
                "content": final_content,
                "toolCount": sum(result.tool_count for result in results),
                "citationCount": len(all_citations),
            },
        }
        yield {
            "event": "synthesis.completed",
            "agent": {"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
            "data": {
                "content": final_content,
                "citations": [citation.model_dump(mode="json") for citation in all_citations],
                "workerSummaries": worker_summaries,
                "agentCount": len(results),
                "structuredOutput": structured_output.model_dump(mode="json"),
            },
        }

    def _conversation_messages(self, base_messages: list[BaseMessage]) -> list[BaseMessage]:
        if base_messages and isinstance(base_messages[0], SystemMessage):
            return list(base_messages[1:])
        return list(base_messages)

    def _worker_prompt(
        self,
        base_messages: list[BaseMessage],
        context: AgentRuntimeContext,
        spec: WorkerSpec,
        skill_prompts: list[str],
        capability_notes: list[str],
    ) -> str:
        global_prompt = ""
        if base_messages and isinstance(base_messages[0], SystemMessage):
            global_prompt = _stringify_message_content(base_messages[0].content)
        sections = [global_prompt, f"You are {spec.label} inside AGOS.", spec.instruction]
        sections.append(f"Selected ticker: {context.selected_ticker or 'none'}. Mode: {context.mode}.")
        if skill_prompts:
            sections.append("Active AGOS skills:\n- " + "\n- ".join(skill_prompts))
        if capability_notes:
            sections.append("External capability status:\n- " + "\n- ".join(capability_notes))
        sections.append(
            "Return a concise operator memo. Separate evidence from inference. Use tools when they improve confidence, not by default."
        )
        return "\n\n".join(section for section in sections if section)

    def _synthesis_system_prompt(self, base_messages: list[BaseMessage], context: AgentRuntimeContext) -> str:
        global_prompt = ""
        if base_messages and isinstance(base_messages[0], SystemMessage):
            global_prompt = _stringify_message_content(base_messages[0].content)
        return (
            f"{global_prompt}\n\n"
            "You are the AGOS synthesis agent. Combine worker outputs into one answer. "
            "Keep the result crisp, operator-facing, and faithful to evidence. "
            "Present sections for Overview, Evidence, Recommendations, Assumptions, Risks, and Next Steps. "
            "Always include an 'Assumptions' block detailing presumed risk tolerance, horizon, and liquidity needs. "
            "Frame recommendations as advisory and not execution-ready unless an execution guard explicitly approved it. "
            f"Current mode: {context.mode}. Selected ticker: {context.selected_ticker or 'none'}."
        )

    def _synthesis_prompt(self, results: list[WorkerResult], context: AgentRuntimeContext) -> str:
        sections = [
            f"Selected ticker: {context.selected_ticker or 'none'}",
            f"Mode: {context.mode}",
            "Worker outputs:",
        ]
        for result in results:
            sections.append(f"[{result.label}] Summary: {result.summary}")
            sections.append(result.content)
        sections.append(
            "Write a single final answer for the operator. Make tool/model activity invisible unless it directly matters."
        )
        return "\n\n".join(sections)

    def _fallback_synthesis(self, results: list[WorkerResult], context: AgentRuntimeContext) -> str:
        lines = [
            f"Overview: AGOS completed a {context.mode} pass for {context.selected_ticker or 'the current context'}.",
            "Evidence:",
        ]
        for result in results:
            lines.append(f"- {result.label}: {result.summary}")
        lines.append("Next Step:")
        lines.append("- Review the consolidated evidence and decide whether a deeper rerun or narrower follow-up is needed.")
        lines.append("Assumptions:")
        lines.append("- Risk tolerance, liquidity needs, and tax constraints were not explicitly provided.")
        lines.append("- Recommendations are advisory and not execution-ready.")
        lines.append("Risks:")
        lines.append("- Source freshness and execution constraints must be verified before action.")
        return "\n".join(lines)


def build_agent_graph(mode: str, run_config: AgentRunConfig | None = None):
    return ConcurrentAgentGraph(mode, run_config or AgentRunConfig())

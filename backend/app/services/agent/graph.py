from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage

from app.models.agent import AgentRunConfig, Citation
from app.services.agent.configuration import resolve_model_profile
from app.services.agent.llm import build_chat_model, is_model_configured
from app.services.agent.prompts import (
    MODEL_NOT_CONFIGURED_FINAL,
    MODEL_NOT_CONFIGURED_WORKER_CONTENT,
    MODEL_NOT_CONFIGURED_WORKER_SUMMARY,
    build_fallback_synthesis,
    build_synthesis_prompt,
    build_synthesis_system_prompt,
    build_worker_prompt,
    stringify_message_content,
)
from app.services.agent.skills import resolve_skill_prompts
from app.services.agent.state import AgentRuntimeContext
from app.services.agent.structured_output import annotate_citation, build_structured_output
from app.services.agent.tools.registry import (
    describe_external_capabilities,
    get_available_tools,
    get_tool_index,
)
from app.services.agent.types import EmitFn, RuntimeEvent, WorkerResult, WorkerSpec
from app.services.agent.workers import build_worker_specs as build_configured_worker_specs


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
    text = stringify_message_content(getattr(message, "content", ""))
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


def build_worker_specs(mode: str, context: AgentRuntimeContext, run_config: AgentRunConfig) -> list[WorkerSpec]:
    return build_configured_worker_specs(mode, context, run_config)


class ConcurrentAgentGraph:
    def __init__(self, mode: str, run_config: AgentRunConfig):
        self.mode = mode
        self.run_config = run_config
        self.model_profile = resolve_model_profile(run_config)

    def _build_model(self):
        return build_chat_model(self.model_profile, self.run_config)

    async def astream_events(self, graph_state: dict[str, Any], config: dict[str, Any], version: str = "v2") -> AsyncIterator[RuntimeEvent]:
        del version
        context: AgentRuntimeContext = graph_state["context"]
        base_messages: list[BaseMessage] = list(graph_state["messages"])
        worker_specs = build_worker_specs(self.mode, context, self.run_config)

        if not is_model_configured():
            worker_summaries = [
                {
                    "agentId": spec.agent_id,
                    "label": spec.label,
                    "role": spec.role,
                    "summary": MODEL_NOT_CONFIGURED_WORKER_SUMMARY,
                    "toolCount": 0,
                }
                for spec in worker_specs
            ]
            for spec in worker_specs:
                yield {
                    "event": "agent.started",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {"detail": f"{spec.label} is offline because DeepSeek is not configured."},
                }
                yield {
                    "event": "agent.completed",
                    "agent": {"id": spec.agent_id, "label": spec.label, "role": spec.role},
                    "data": {
                        "status": "completed",
                        "summary": MODEL_NOT_CONFIGURED_WORKER_SUMMARY,
                        "content": MODEL_NOT_CONFIGURED_WORKER_CONTENT,
                        "toolCount": 0,
                    },
                }
            fallback = MODEL_NOT_CONFIGURED_FINAL
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
            system_prompt = self._worker_prompt(base_messages, context, spec, skill_prompts, capability_notes)
            messages: list[BaseMessage] = [SystemMessage(content=system_prompt), *self._conversation_messages(base_messages)]
            model = self._build_model()
            if tools:
                model = model.bind_tools(tools)

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
                    elif block_type in {"server_tool_call", "server_tool_result"}:
                        continue

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
        return build_worker_prompt(
            base_messages=base_messages,
            selected_ticker=context.selected_ticker,
            mode=context.mode,
            worker_label=spec.label,
            worker_instruction=spec.instruction,
            skill_prompts=skill_prompts,
            capability_notes=capability_notes,
        )

    def _synthesis_system_prompt(self, base_messages: list[BaseMessage], context: AgentRuntimeContext) -> str:
        return build_synthesis_system_prompt(base_messages, context)

    def _synthesis_prompt(self, results: list[WorkerResult], context: AgentRuntimeContext) -> str:
        worker_sections = []
        for result in results:
            worker_sections.append(f"[{result.label}] Summary: {result.summary}\n\n{result.content}")
        return build_synthesis_prompt(worker_sections, context)

    def _fallback_synthesis(self, results: list[WorkerResult], context: AgentRuntimeContext) -> str:
        return build_fallback_synthesis([f"- {result.label}: {result.summary}" for result in results], context)


def build_agent_graph(mode: str, run_config: AgentRunConfig | None = None):
    return ConcurrentAgentGraph(mode, run_config or AgentRunConfig())

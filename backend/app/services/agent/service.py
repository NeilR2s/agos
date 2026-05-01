from __future__ import annotations

import logging
import asyncio
import time
from typing import AsyncIterator, Optional
from uuid import uuid4

from app.core.config import settings
from app.db.agent_cosmos import get_agent_repository, utc_now_iso
from app.models.agent import (
    AgentEvent,
    AgentMessage,
    AgentRun,
    AgentRunRequest,
    AgentRunResult,
    AgentSSEEvent,
    AgentStructuredOutput,
    AgentThread,
    AgentThreadCreate,
    Citation,
)
from app.services.agent.configuration import config_to_public_dict, resolve_model_profile
from app.services.agent.middleware import (
    build_system_prompt,
    derive_thread_title,
    sanitize_preview,
)
from app.services.agent.state import AgentRuntimeContext
from app.services.agent.streaming import build_sse_event, persistable_event, should_persist_event


logger = logging.getLogger(__name__)


class AgentService:
    def __init__(self):
        self.repository = get_agent_repository()
        self._cancelled_run_ids: set[str] = set()

    async def create_thread(self, user_id: str, payload: AgentThreadCreate) -> AgentThread:
        selected_ticker = payload.selectedTicker.upper() if payload.selectedTicker else None
        title = payload.title.strip() if payload.title else "New AGOS Session"
        return await self.repository.create_thread(
            user_id=user_id,
            title=title,
            mode=payload.mode,
            selected_ticker=selected_ticker,
        )

    async def list_threads(self, user_id: str) -> list[AgentThread]:
        return await self.repository.list_threads(user_id=user_id)

    async def delete_thread(self, user_id: str, thread_id: str) -> bool:
        return await self.repository.delete_thread(user_id=user_id, thread_id=thread_id)

    async def get_thread(self, user_id: str, thread_id: str) -> Optional[AgentThread]:
        return await self.repository.get_thread(user_id=user_id, thread_id=thread_id)

    async def generate_thread_title(self, user_id: str, thread_id: str) -> AgentThread:
        thread = await self.get_thread(user_id=user_id, thread_id=thread_id)
        if not thread:
            raise LookupError("Thread not found")
        
        messages = await self.list_messages(thread_id=thread_id)
        user_messages = [m for m in messages if m.role == "user"]
        if not user_messages:
            return thread
            
        first_msg = user_messages[0].content
        
        from langchain_google_genai import ChatGoogleGenerativeAI
        from app.core.config import settings
        
        if not settings.GEMINI_API_KEY:
            new_title = derive_thread_title(first_msg, thread.selectedTicker)
        else:
            try:
                llm = ChatGoogleGenerativeAI(
                    model="gemini-3.1-flash-lite",
                    google_api_key=settings.GEMINI_API_KEY,
                    temperature=1,
                    thinking_level = "high"

                )
                prompt = f"Generate a very short 3-5 word title for a chat thread that starts with this user message: {first_msg}\nReturn ONLY the title, no quotes or prefix."
                resp = await llm.ainvoke(prompt)
                new_title = resp.content.strip().strip('"').strip("'")
                if thread.selectedTicker:
                    new_title = f"{thread.selectedTicker.upper()} / {new_title}"
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Title generation failed: {e}")
                new_title = derive_thread_title(first_msg, thread.selectedTicker)
                
        return await self.repository.update_thread(
            user_id=user_id,
            thread_id=thread_id,
            title=new_title
        )

    async def list_messages(self, thread_id: str) -> list[AgentMessage]:
        return await self.repository.list_messages(thread_id=thread_id)

    async def list_runs(self, thread_id: str) -> list[AgentRun]:
        return await self.repository.list_runs(thread_id=thread_id)

    async def get_run(self, thread_id: str, run_id: str) -> Optional[AgentRun]:
        return await self.repository.get_run(thread_id=thread_id, run_id=run_id)

    async def cancel_run(self, *, user_id: str, thread_id: str, run_id: str) -> AgentRun:
        run = await self.get_run(thread_id=thread_id, run_id=run_id)
        if run is None:
            raise LookupError("Run not found")
        if run.status in {"completed", "error", "cancelled"}:
            return run

        self._cancelled_run_ids.add(run_id)
        cancelled = await self.repository.update_run(
            thread_id=thread_id,
            run_id=run_id,
            status="cancelled",
            completedAt=utc_now_iso(),
            summary=None,
            error=None,
        )
        await self.repository.update_thread(
            user_id=user_id,
            thread_id=thread_id,
            lastRunStatus="cancelled",
        )
        return cancelled

    async def list_events(self, thread_id: str, run_id: Optional[str] = None, limit: int = 2000) -> list[AgentEvent]:
        return await self.repository.list_events(thread_id=thread_id, run_id=run_id, limit=limit)

    async def run_once(
        self,
        *,
        user_id: str,
        auth_subject: str | None,
        auth_token: str | None,
        thread_id: str,
        payload: AgentRunRequest,
    ) -> AgentRunResult:
        run_id: str | None = None
        async for event in self.stream_run_events(
            user_id=user_id,
            auth_subject=auth_subject,
            auth_token=auth_token,
            thread_id=thread_id,
            payload=payload,
        ):
            if event.type == "run.started":
                run_id = event.runId

        if run_id is None:
            raise RuntimeError("Run failed to start")

        thread = await self.get_thread(user_id=user_id, thread_id=thread_id)
        run = await self.get_run(thread_id=thread_id, run_id=run_id)
        if thread is None or run is None:
            raise RuntimeError("Run persistence incomplete")

        messages = await self.list_messages(thread_id)
        assistant_message = next(
            (
                message
                for message in reversed(messages)
                if message.runId == run_id and message.role == "assistant"
            ),
            None,
        )
        events = await self.list_events(thread_id=thread_id, run_id=run_id)
        return AgentRunResult(thread=thread, run=run, assistantMessage=assistant_message, events=events)

    async def stream_run_events(
        self,
        *,
        user_id: str,
        auth_subject: str | None,
        auth_token: str | None,
        thread_id: str,
        payload: AgentRunRequest,
    ) -> AsyncIterator[AgentSSEEvent]:
        thread = await self.get_thread(user_id=user_id, thread_id=thread_id)
        if thread is None:
            raise LookupError("Thread not found")

        resolved_mode = payload.mode or thread.mode
        selected_ticker = payload.selectedTicker.upper() if payload.selectedTicker else thread.selectedTicker
        model_profile = resolve_model_profile(payload.config)
        if thread.mode != resolved_mode or thread.selectedTicker != selected_ticker:
            thread = await self.repository.update_thread(
                user_id=user_id,
                thread_id=thread_id,
                mode=resolved_mode,
                selectedTicker=selected_ticker,
            )

        run_id = str(uuid4())
        started_at = utc_now_iso()
        run_started_perf = time.perf_counter()
        run = AgentRun(
            id=run_id,
            threadId=thread_id,
            userId=user_id,
            model=model_profile.model,
            mode=resolved_mode,
            selectedTicker=selected_ticker,
            status="running",
            startedAt=started_at,
            config=config_to_public_dict(payload.config),
        )
        context = AgentRuntimeContext(
            mode=resolved_mode,
            selected_ticker=selected_ticker,
            correlation_id=str(uuid4()),
            lookback_days=payload.lookbackDays,
            ui_context=payload.uiContext,
            feature_flags={"action_tools": settings.AGENT_ENABLE_ACTION_TOOLS},
        )
        runtime_config = {
            "user_id": user_id,
            "auth_subject": auth_subject,
            "auth_token": auth_token,
        }

        sequence = 0
        assistant_chunks: list[str] = []
        citations: list[Citation] = []
        first_token_at: float | None = None
        worker_summaries: list[dict] = []
        agent_count = 0
        tool_event_count = 0
        final_content_from_graph: str | None = None
        structured_output: AgentStructuredOutput | None = None

        def raise_if_cancelled() -> None:
            if run_id in self._cancelled_run_ids:
                raise asyncio.CancelledError

        async def next_event(
            event_type: str,
            data: dict,
            *,
            source: str = "agent",
            agent: dict | None = None,
        ) -> AgentSSEEvent:
            nonlocal sequence
            raise_if_cancelled()
            sequence += 1
            event = build_sse_event(
                thread_id=thread_id,
                run_id=run_id,
                sequence=sequence,
                event_type=event_type,
                data=data,
                agent_id=agent.get("id") if agent else None,
                agent_label=agent.get("label") if agent else None,
                agent_role=agent.get("role") if agent else None,
                parent_agent_id=agent.get("parentId") if agent else None,
            )
            if should_persist_event(event_type):
                try:
                    await self.repository.create_events([persistable_event(event, source=source)])
                except Exception:
                    logger.exception("Failed to persist agent event", extra={"thread_id": thread_id, "run_id": run_id, "event_type": event_type})
            return event

        try:
            await self.repository.create_run(run)

            user_message = AgentMessage(
                id=str(uuid4()),
                threadId=thread_id,
                runId=run_id,
                agentId=None,
                role="user",
                content=payload.message.strip(),
                citations=[],
                createdAt=started_at,
                tokenCount=len(payload.message.split()),
            )
            await self.repository.create_message(user_message)

            if thread.title == "New AGOS Session":
                thread = await self.repository.update_thread(
                    user_id=user_id,
                    thread_id=thread_id,
                    title=derive_thread_title(payload.message, selected_ticker),
                )
                asyncio.create_task(self.generate_thread_title(user_id, thread_id))

            history = list(
                reversed(
                    [
                        message
                        for message in await self.repository.list_messages(
                            thread_id=thread_id,
                            limit=settings.AGENT_HISTORY_WINDOW + 1,
                            newest_first=True,
                        )
                        if message.id != user_message.id
                    ]
                )
            )
            system_prompt = build_system_prompt(context)

            yield await next_event(
                "run.started",
                {
                    "thread": thread.model_dump(mode="json"),
                    "run": run.model_dump(mode="json"),
                },
            )
            yield await next_event("heartbeat", {"status": "alive"})
            yield await next_event(
                "reasoning.step",
                {
                    "title": "Context assembly",
                    "detail": f"Initializing AGOS multi-agent run with up to {payload.config.maxAgents} concurrent workers.",
                },
            )

            from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

            from app.services.agent.graph import build_agent_graph

            graph = build_agent_graph(resolved_mode, payload.config)
            
            messages = [SystemMessage(content=system_prompt)]
            for msg in history:
                if msg.role == "user":
                    messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    messages.append(AIMessage(content=msg.content))
            messages.append(HumanMessage(content=payload.message))

            graph_state = {
                "messages": messages,
                "context": context,
            }
            config = {
                "configurable": {
                    "thread_id": thread_id,
                    "context": context,
                    "runtime": runtime_config,
                }
            }
            
            token_started_perf = time.perf_counter()
            
            async for event in graph.astream_events(graph_state, config=config, version="v2"):
                raise_if_cancelled()
                kind = event.get("event")
                data = event.get("data") if isinstance(event.get("data"), dict) else {}
                agent = event.get("agent") if isinstance(event.get("agent"), dict) else None

                if kind == "message.delta":
                    content = data.get("delta")
                    if isinstance(content, str) and content:
                        if first_token_at is None:
                            first_token_at = (time.perf_counter() - token_started_perf) * 1000
                        assistant_chunks.append(content)
                        yield await next_event("message.delta", {"delta": content}, source="assistant", agent=agent)
                    continue

                if kind == "citation.added":
                    candidate = data.get("citation")
                    if isinstance(candidate, dict):
                        try:
                            citation = Citation(**candidate)
                            citations.append(citation)
                            yield await next_event("citation.added", {"citation": citation.model_dump(mode="json")}, source="tool", agent=agent)
                        except Exception:
                            logger.exception("Invalid citation payload", extra={"thread_id": thread_id, "run_id": run_id})
                    continue

                if kind == "synthesis.completed":
                    if isinstance(data.get("content"), str):
                        final_content_from_graph = data["content"]
                    structured_candidate = data.get("structuredOutput")
                    if isinstance(structured_candidate, dict):
                        try:
                            structured_output = AgentStructuredOutput(**structured_candidate)
                        except Exception:
                            logger.exception("Invalid structured output payload", extra={"thread_id": thread_id, "run_id": run_id})
                    payload_citations = data.get("citations")
                    if isinstance(payload_citations, list):
                        citations = []
                        for item in payload_citations:
                            if not isinstance(item, dict):
                                continue
                            try:
                                citations.append(Citation(**item))
                            except Exception:
                                continue
                    worker_summaries = data.get("workerSummaries") if isinstance(data.get("workerSummaries"), list) else []
                    agent_count = int(data.get("agentCount") or 0)
                    yield await next_event(kind, data, source="agent", agent=agent)
                    continue

                if kind in {"tool.started", "tool.completed"}:
                    tool_event_count += 1 if kind == "tool.completed" else 0
                    yield await next_event(kind, data, source="tool", agent=agent)
                    continue

                if kind in {"tool.error", "agent.started", "agent.completed", "reasoning.step"}:
                    yield await next_event(kind, data, source="agent" if kind.startswith("agent") or kind == "reasoning.step" else "tool", agent=agent)
                    continue

            assistant_content = "".join(assistant_chunks).strip()
            if not assistant_content and final_content_from_graph:
                assistant_content = final_content_from_graph.strip()
            if not assistant_content:
                assistant_content = (
                    "No model output was returned for this run. Review the trace and retry once the model connection is stable."
                )
                
            persisted_run = await self.repository.get_run(thread_id=thread_id, run_id=run_id)
            if persisted_run and persisted_run.status == "cancelled":
                self._cancelled_run_ids.discard(run_id)
                return

            assistant_message = AgentMessage(
                id=str(uuid4()),
                threadId=thread_id,
                runId=run_id,
                agentId="synthesizer",
                role="assistant",
                content=assistant_content,
                citations=citations,
                createdAt=utc_now_iso(),
                tokenCount=len(assistant_content.split()),
                structuredOutput=structured_output,
            )
            await self.repository.create_message(assistant_message)

            completed_at = utc_now_iso()
            latency_ms = (time.perf_counter() - run_started_perf) * 1000
            run = await self.repository.update_run(
                thread_id=thread_id,
                run_id=run_id,
                model=model_profile.model,
                status="completed",
                completedAt=completed_at,
                latencyMs=latency_ms,
                ttftMs=first_token_at,
                summary=sanitize_preview(assistant_content),
                usage={
                    "toolCount": tool_event_count,
                    "citationCount": len(citations),
                    "sourceCount": len(structured_output.sources) if structured_output else len(citations),
                    "tokenCount": assistant_message.tokenCount,
                    "agentCount": agent_count or payload.config.maxAgents,
                    "workerSummaries": worker_summaries,
                },
                config=config_to_public_dict(payload.config),
                error=None,
            )
            thread = await self.repository.update_thread(
                user_id=user_id,
                thread_id=thread_id,
                mode=resolved_mode,
                selectedTicker=selected_ticker,
                lastRunStatus="completed",
                lastAssistantPreview=sanitize_preview(assistant_content),
            )

            final_events = [
                await next_event(
                    "message.completed",
                    {
                        "message": assistant_message.model_dump(mode="json"),
                        "citations": [citation.model_dump(mode="json") for citation in citations],
                    },
                    source="assistant",
                    agent={"id": "synthesizer", "label": "Synthesis", "role": "synthesizer"},
                ),
                await next_event(
                    "checkpoint.saved",
                    {
                        "messagesPersisted": 2,
                        "eventCount": sequence,
                        "threadUpdatedAt": thread.updatedAt,
                    },
                    source="persistence",
                ),
                await next_event(
                    "run.completed",
                    {
                        "thread": thread.model_dump(mode="json"),
                        "run": run.model_dump(mode="json"),
                    },
                    source="runtime",
                ),
            ]
            for event in final_events:
                yield event
        except asyncio.CancelledError:
            logger.info("Agent run stream cancelled", extra={"thread_id": thread_id, "run_id": run_id})
            latency_ms = (time.perf_counter() - run_started_perf) * 1000
            try:
                run = await self.repository.update_run(
                    thread_id=thread_id,
                    run_id=run_id,
                    model=model_profile.model,
                    status="cancelled",
                    completedAt=utc_now_iso(),
                    latencyMs=latency_ms,
                    ttftMs=first_token_at,
                    summary=None,
                    config=config_to_public_dict(payload.config),
                    error=None,
                )
                await self.repository.update_thread(
                    user_id=user_id,
                    thread_id=thread_id,
                    lastRunStatus="cancelled",
                )
            except Exception:
                logger.exception("Failed to persist cancelled run", extra={"thread_id": thread_id, "run_id": run_id})
            finally:
                self._cancelled_run_ids.discard(run_id)
            raise
        except Exception as exc:
            logger.exception("Agent run failed", extra={"thread_id": thread_id, "run_id": run_id})
            error_message = str(exc)
            latency_ms = (time.perf_counter() - run_started_perf) * 1000
            run = run.model_copy(
                update={
                    "status": "error",
                    "completedAt": utc_now_iso(),
                    "latencyMs": latency_ms,
                    "ttftMs": first_token_at,
                    "error": error_message,
                    "summary": None,
                }
            )
            try:
                persisted_run = await self.repository.get_run(thread_id=thread_id, run_id=run_id)
            except Exception:
                logger.exception("Failed to load errored run state", extra={"thread_id": thread_id, "run_id": run_id})
                persisted_run = None

            if persisted_run is not None:
                try:
                    run = await self.repository.update_run(
                        thread_id=thread_id,
                        run_id=run_id,
                        model=model_profile.model,
                        status="error",
                        completedAt=run.completedAt,
                        latencyMs=latency_ms,
                        ttftMs=first_token_at,
                        error=error_message,
                        summary=None,
                        config=config_to_public_dict(payload.config),
                    )
                except Exception:
                    logger.exception("Failed to persist errored run", extra={"thread_id": thread_id, "run_id": run_id})

            try:
                thread = await self.repository.update_thread(
                    user_id=user_id,
                    thread_id=thread_id,
                    lastRunStatus="error",
                )
            except Exception:
                logger.exception("Failed to persist errored thread state", extra={"thread_id": thread_id})
                thread = thread.model_copy(update={"lastRunStatus": "error"})

            error_event = await next_event(
                "run.error",
                {
                    "error": error_message,
                    "run": run.model_dump(mode="json"),
                    "thread": thread.model_dump(mode="json"),
                },
                source="runtime",
            )
            yield error_event


service: AgentService | None = None

def get_agent_service() -> AgentService:
    global service
    if service is None:
        service = AgentService()
    return service

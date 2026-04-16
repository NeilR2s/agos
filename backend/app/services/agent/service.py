from __future__ import annotations

import logging
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
    AgentThread,
    AgentThreadCreate,
    Citation,
)
from app.services.agent.middleware import (
    build_system_prompt,
    derive_thread_title,
    sanitize_preview,
)
from app.services.agent.state import AgentRuntimeContext, ToolOutcome
from app.services.agent.streaming import build_sse_event, persistable_event, should_persist_event


logger = logging.getLogger(__name__)


class AgentService:
    def __init__(self):
        self.repository = get_agent_repository()

    async def create_thread(self, user_id: str, payload: AgentThreadCreate) -> AgentThread:
        selected_ticker = payload.selectedTicker.upper() if payload.selectedTicker else None
        title = payload.title.strip() if payload.title else "New AGOS Session"
        return self.repository.create_thread(
            user_id=user_id,
            title=title,
            mode=payload.mode,
            selected_ticker=selected_ticker,
        )

    def list_threads(self, user_id: str) -> list[AgentThread]:
        return self.repository.list_threads(user_id=user_id)

    def delete_thread(self, user_id: str, thread_id: str) -> bool:
        return self.repository.delete_thread(user_id=user_id, thread_id=thread_id)

    def get_thread(self, user_id: str, thread_id: str) -> Optional[AgentThread]:
        return self.repository.get_thread(user_id=user_id, thread_id=thread_id)

    async def generate_thread_title(self, user_id: str, thread_id: str) -> AgentThread:
        thread = self.get_thread(user_id=user_id, thread_id=thread_id)
        if not thread:
            raise LookupError("Thread not found")
        
        messages = self.list_messages(thread_id=thread_id)
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
                    model="gemini-3.1-flash-lite-preview",
                    google_api_key=settings.GEMINI_API_KEY,
                    temperature=0.3
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
                
        return self.repository.update_thread(
            user_id=user_id,
            thread_id=thread_id,
            title=new_title
        )

    def list_messages(self, thread_id: str) -> list[AgentMessage]:
        return self.repository.list_messages(thread_id=thread_id)

    def list_runs(self, thread_id: str) -> list[AgentRun]:
        return self.repository.list_runs(thread_id=thread_id)

    def get_run(self, thread_id: str, run_id: str) -> Optional[AgentRun]:
        return self.repository.get_run(thread_id=thread_id, run_id=run_id)

    def list_events(self, thread_id: str, run_id: Optional[str] = None) -> list[AgentEvent]:
        return self.repository.list_events(thread_id=thread_id, run_id=run_id)

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

        thread = self.get_thread(user_id=user_id, thread_id=thread_id)
        run = self.get_run(thread_id=thread_id, run_id=run_id)
        if thread is None or run is None:
            raise RuntimeError("Run persistence incomplete")

        messages = self.list_messages(thread_id)
        assistant_message = next(
            (
                message
                for message in reversed(messages)
                if message.runId == run_id and message.role == "assistant"
            ),
            None,
        )
        events = self.list_events(thread_id=thread_id, run_id=run_id)
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
        thread = self.get_thread(user_id=user_id, thread_id=thread_id)
        if thread is None:
            raise LookupError("Thread not found")

        resolved_mode = payload.mode or thread.mode
        selected_ticker = payload.selectedTicker.upper() if payload.selectedTicker else thread.selectedTicker
        if thread.mode != resolved_mode or thread.selectedTicker != selected_ticker:
            thread = self.repository.update_thread(
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
            model=settings.AGENT_MODEL,
            mode=resolved_mode,
            selectedTicker=selected_ticker,
            status="running",
            startedAt=started_at,
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
        persisted_events: list[AgentEvent] = []
        assistant_chunks: list[str] = []
        citations: list[Citation] = []
        tool_outcomes: list[ToolOutcome] = []
        first_token_at: float | None = None

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

        def next_event(event_type: str, data: dict, source: str = "agent") -> AgentSSEEvent:
            nonlocal sequence
            sequence += 1
            event = build_sse_event(
                thread_id=thread_id,
                run_id=run_id,
                sequence=sequence,
                event_type=event_type,
                data=data,
            )
            if should_persist_event(event_type):
                persisted_events.append(persistable_event(event, source=source))
            return event

        try:
            self.repository.create_run(run)

            user_message = AgentMessage(
                id=str(uuid4()),
                threadId=thread_id,
                runId=run_id,
                role="user",
                content=payload.message.strip(),
                citations=[],
                createdAt=started_at,
                tokenCount=len(payload.message.split()),
            )
            self.repository.create_message(user_message)

            if thread.title == "New AGOS Session":
                thread = self.repository.update_thread(
                    user_id=user_id,
                    thread_id=thread_id,
                    title=derive_thread_title(payload.message, selected_ticker),
                )
                import asyncio

                asyncio.create_task(self.generate_thread_title(user_id, thread_id))

            history = list(
                reversed(
                    [
                        message
                        for message in self.repository.list_messages(
                            thread_id=thread_id,
                            limit=settings.AGENT_HISTORY_WINDOW + 1,
                            newest_first=True,
                        )
                        if message.id != user_message.id
                    ]
                )
            )
            system_prompt = build_system_prompt(context)

            yield next_event(
                "run.started",
                {
                    "thread": thread.model_dump(mode="json"),
                    "run": run.model_dump(mode="json"),
                },
            )
            yield next_event("heartbeat", {"status": "alive"})
            yield next_event(
                "reasoning.step",
                {
                    "title": "Context assembly",
                    "detail": "Initializing multi-agent graph with bound tools.",
                },
            )

            from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
            from app.services.agent.graph import build_agent_graph

            graph = build_agent_graph(resolved_mode)
            
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
                kind = event["event"]
                name = event["name"]
                
                if kind == "on_chat_model_stream" and name != "agent":
                    chunk = event["data"]["chunk"]
                    content = stringify_message_content(getattr(chunk, "content", ""))
                    if content:
                        if first_token_at is None:
                            first_token_at = (time.perf_counter() - token_started_perf) * 1000
                        assistant_chunks.append(content)
                        yield next_event("message.delta", {"delta": content}, source="assistant")

                elif kind == "on_chat_model_end" and name != "agent" and not assistant_chunks:
                    output = event["data"].get("output")
                    content = stringify_message_content(getattr(output, "content", ""))
                    if content:
                        if first_token_at is None:
                            first_token_at = (time.perf_counter() - token_started_perf) * 1000
                        assistant_chunks.append(content)
                        yield next_event("message.delta", {"delta": content}, source="assistant")
                        
                elif kind == "on_tool_start":
                    yield next_event(
                        "tool.started",
                        {"name": name, "detail": f"Agent invoking {name}."},
                        source="tool"
                    )
                    
                elif kind == "on_tool_end":
                    output = event["data"].get("output", {})
                    if isinstance(output, dict) and "citations" in output:
                        for raw_cit in output["citations"]:
                            try:
                                cit = Citation(**raw_cit) if isinstance(raw_cit, dict) else raw_cit
                                citations.append(cit)
                                yield next_event("citation.added", {"citation": cit.model_dump(mode="json")}, source="tool")
                            except Exception:
                                pass
                    yield next_event(
                        "tool.completed",
                        {
                            "name": name,
                            "summary": output.get("summary", "Tool execution complete.") if isinstance(output, dict) else str(output),
                            "riskFlags": output.get("risk_flags", []) if isinstance(output, dict) else [],
                        },
                        source="tool",
                    )
                    if isinstance(output, dict):
                        tool_outcomes.append(ToolOutcome(
                            name=name,
                            summary=output.get("summary", str(output)),
                            payload=output,
                            risk_flags=output.get("risk_flags", [])
                        ))
                    
                elif kind == "on_tool_error":
                    yield next_event(
                        "tool.error",
                        {"name": name, "error": str(event["data"].get("error", "Unknown tool error"))},
                        source="tool"
                    )

            assistant_content = "".join(assistant_chunks).strip()
            if not assistant_content:
                assistant_content = (
                    "No model output was returned for this run. Review the trace and retry once the model connection is stable."
                )
                
            assistant_message = AgentMessage(
                id=str(uuid4()),
                threadId=thread_id,
                runId=run_id,
                role="assistant",
                content=assistant_content,
                citations=citations,
                createdAt=utc_now_iso(),
                tokenCount=len(assistant_content.split()),
            )
            self.repository.create_message(assistant_message)

            completed_at = utc_now_iso()
            latency_ms = (time.perf_counter() - run_started_perf) * 1000
            run = self.repository.update_run(
                thread_id=thread_id,
                run_id=run_id,
                model=settings.AGENT_MODEL,
                status="completed",
                completedAt=completed_at,
                latencyMs=latency_ms,
                ttftMs=first_token_at,
                summary=sanitize_preview(assistant_content),
                usage={
                    "toolCount": len(tool_outcomes),
                    "citationCount": len(citations),
                    "tokenCount": assistant_message.tokenCount,
                },
                error=None,
            )
            thread = self.repository.update_thread(
                user_id=user_id,
                thread_id=thread_id,
                mode=resolved_mode,
                selectedTicker=selected_ticker,
                lastRunStatus="completed",
                lastAssistantPreview=sanitize_preview(assistant_content),
            )

            final_events = [
                next_event(
                    "message.completed",
                    {
                        "message": assistant_message.model_dump(mode="json"),
                        "citations": [citation.model_dump(mode="json") for citation in citations],
                    },
                    source="assistant",
                ),
                next_event(
                    "checkpoint.saved",
                    {
                        "messagesPersisted": 2,
                        "eventCount": len(persisted_events),
                        "threadUpdatedAt": thread.updatedAt,
                    },
                    source="persistence",
                ),
                next_event(
                    "run.completed",
                    {
                        "thread": thread.model_dump(mode="json"),
                        "run": run.model_dump(mode="json"),
                    },
                    source="runtime",
                ),
            ]
            self.repository.create_events(persisted_events)
            for event in final_events:
                yield event
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
                persisted_run = self.repository.get_run(thread_id=thread_id, run_id=run_id)
            except Exception:
                logger.exception("Failed to load errored run state", extra={"thread_id": thread_id, "run_id": run_id})
                persisted_run = None

            if persisted_run is not None:
                try:
                    run = self.repository.update_run(
                        thread_id=thread_id,
                        run_id=run_id,
                        model=settings.AGENT_MODEL,
                        status="error",
                        completedAt=run.completedAt,
                        latencyMs=latency_ms,
                        ttftMs=first_token_at,
                        error=error_message,
                        summary=None,
                    )
                except Exception:
                    logger.exception("Failed to persist errored run", extra={"thread_id": thread_id, "run_id": run_id})

            try:
                thread = self.repository.update_thread(
                    user_id=user_id,
                    thread_id=thread_id,
                    lastRunStatus="error",
                )
            except Exception:
                logger.exception("Failed to persist errored thread state", extra={"thread_id": thread_id})
                thread = thread.model_copy(update={"lastRunStatus": "error"})

            error_event = next_event(
                "run.error",
                {
                    "error": error_message,
                    "run": run.model_dump(mode="json"),
                    "thread": thread.model_dump(mode="json"),
                },
                source="runtime",
            )
            try:
                self.repository.create_events(persisted_events)
            except Exception:
                logger.exception("Failed to persist agent events", extra={"thread_id": thread_id, "run_id": run_id})
            yield error_event


service: AgentService | None = None

def get_agent_service() -> AgentService:
    global service
    if service is None:
        service = AgentService()
    return service

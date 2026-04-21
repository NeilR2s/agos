from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse

from app.core.security import get_current_user, oauth2_scheme
from app.models.agent import (
    AgentInterruptDecisionRequest,
    AgentRun,
    AgentRunRequest,
    AgentRunResult,
    AgentThread,
    AgentThreadCreate,
)
from app.services.agent.service import AgentService, get_agent_service
from app.services.agent.streaming import encode_sse
from app.core.limiter import limiter

router = APIRouter()


def _user_id(current_user: dict) -> str:
    return str(current_user.get("uid") or current_user.get("sub") or "")


def _subject(current_user: dict) -> str | None:
    return current_user.get("sub") or current_user.get("uid")


async def _assert_thread(service: AgentService, user_id: str, thread_id: str) -> AgentThread:
    thread = await service.get_thread(user_id=user_id, thread_id=thread_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return thread


@router.post("/threads", response_model=AgentThread, status_code=status.HTTP_201_CREATED)
async def create_thread(
    payload: AgentThreadCreate,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    return await service.create_thread(user_id=_user_id(current_user), payload=payload)


@router.get("/threads", response_model=list[AgentThread])
async def list_threads(
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    return await service.list_threads(user_id=_user_id(current_user))


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    deleted = await service.delete_thread(_user_id(current_user), thread_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")


@router.post("/threads/{thread_id}/generate-title", response_model=AgentThread)
async def generate_thread_title(
    thread_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    return await service.generate_thread_title(_user_id(current_user), thread_id)

@router.get("/threads/{thread_id}", response_model=AgentThread)
async def get_thread(
    thread_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    return await _assert_thread(service, _user_id(current_user), thread_id)


@router.get("/threads/{thread_id}/messages")
async def list_messages(
    thread_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    return await service.list_messages(thread_id=thread_id)


@router.get("/threads/{thread_id}/runs", response_model=list[AgentRun])
async def list_runs(
    thread_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    return await service.list_runs(thread_id=thread_id)


@router.post("/threads/{thread_id}/runs", response_model=AgentRunResult)
@limiter.limit("10/minute")
async def create_run(
    request: Request,
    thread_id: str,
    payload: AgentRunRequest,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
    token: str | None = Depends(oauth2_scheme),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    try:
        return await service.run_once(
            user_id=_user_id(current_user),
            auth_subject=_subject(current_user),
            auth_token=token,
            thread_id=thread_id,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/threads/{thread_id}/runs/stream")
@limiter.limit("10/minute")
async def stream_run(
    request: Request,
    thread_id: str,
    payload: AgentRunRequest,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
    token: str | None = Depends(oauth2_scheme),
):
    await _assert_thread(service, _user_id(current_user), thread_id)

    async def event_generator():
        try:
            async for event in service.stream_run_events(
                user_id=_user_id(current_user),
                auth_subject=_subject(current_user),
                auth_token=token,
                thread_id=thread_id,
                payload=payload,
            ):
                yield encode_sse(event)
        except LookupError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/threads/{thread_id}/runs/{run_id}", response_model=AgentRun)
async def get_run(
    thread_id: str,
    run_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    run = await service.get_run(thread_id=thread_id, run_id=run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    return run


@router.get("/threads/{thread_id}/runs/{run_id}/events")
async def get_run_events(
    thread_id: str,
    run_id: str,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    return await service.list_events(thread_id=thread_id, run_id=run_id)

@router.post("/threads/{thread_id}/runs/{run_id}/interrupt", response_model=AgentRunResult)
@limiter.limit("10/minute")
async def process_interrupt(
    request: Request,
    thread_id: str,
    run_id: str,
    payload: AgentInterruptDecisionRequest,
    service: AgentService = Depends(get_agent_service),
    current_user: dict = Depends(get_current_user),
    token: str | None = Depends(oauth2_scheme),
):
    await _assert_thread(service, _user_id(current_user), thread_id)
    # The actual graph resume logic would go here, updating LangGraph state.
    # For now, we return 501 Not Implemented, as the graph state persistence 
    # and resume logic for LangGraph is not fully wired up.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Interrupt resumption is not fully implemented in the graph runner yet.")


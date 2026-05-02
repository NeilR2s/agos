from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from azure.cosmos.aio import CosmosClient
from azure.cosmos import PartitionKey, exceptions

from app.core.config import settings
from app.models.agent import AgentEvent, AgentMessage, AgentRun, AgentThread

logger = logging.getLogger(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentCosmosRepository:
    """CRUD layer for agent threads, messages, runs, and events.

    Accepts a *shared* async ``CosmosClient`` owned by the application lifespan.
    Use ``await AgentCosmosRepository.create(client)`` for async init.
    """

    def __init__(self, client: CosmosClient):
        self.client = client

    @classmethod
    async def create(cls, client: CosmosClient) -> "AgentCosmosRepository":
        """Async factory — call during lifespan startup."""
        instance = cls(client)
        instance.database = client.get_database_client(settings.COSMOS_DATABASE_ID)
        instance.threads_container = await instance.database.create_container_if_not_exists(
            id=settings.COSMOS_AGENT_THREADS_CONTAINER,
            partition_key=PartitionKey(path="/userId"),
        )
        instance.messages_container = await instance.database.create_container_if_not_exists(
            id=settings.COSMOS_AGENT_MESSAGES_CONTAINER,
            partition_key=PartitionKey(path="/threadId"),
        )
        instance.runs_container = await instance.database.create_container_if_not_exists(
            id=settings.COSMOS_AGENT_RUNS_CONTAINER,
            partition_key=PartitionKey(path="/threadId"),
        )
        instance.events_container = await instance.database.create_container_if_not_exists(
            id=settings.COSMOS_AGENT_EVENTS_CONTAINER,
            partition_key=PartitionKey(path="/threadId"),
        )
        instance.checkpoints_container = await instance.database.create_container_if_not_exists(
            id=settings.COSMOS_AGENT_CHECKPOINTS_CONTAINER,
            partition_key=PartitionKey(path="/partition_key"),
        )
        return instance

    async def create_thread(self, *, user_id: str, title: str, mode: str, selected_ticker: Optional[str]) -> AgentThread:
        now = utc_now_iso()
        thread = AgentThread(
            id=str(uuid4()),
            userId=user_id,
            title=title,
            mode=mode,
            selectedTicker=selected_ticker,
            createdAt=now,
            updatedAt=now,
        )
        await self.threads_container.create_item(thread.model_dump(mode="json"))
        return thread

    async def list_threads(self, user_id: str, limit: int = 50) -> list[AgentThread]:
        query = (
            "SELECT * FROM c WHERE c.userId = @userId "
            "ORDER BY c.updatedAt DESC OFFSET 0 LIMIT @limit"
        )
        items = self.threads_container.query_items(
            query=query,
            parameters=[
                {"name": "@userId", "value": user_id},
                {"name": "@limit", "value": limit},
            ],
            partition_key=user_id,
        )
        return [AgentThread.model_validate(item) async for item in items]

    async def get_thread(self, user_id: str, thread_id: str) -> Optional[AgentThread]:
        try:
            item = await self.threads_container.read_item(item=thread_id, partition_key=user_id)
        except exceptions.CosmosResourceNotFoundError:
            return None
        except exceptions.CosmosHttpResponseError as exc:
            logger.error("Failed to load agent thread %s: %s", thread_id, exc)
            raise
        return AgentThread.model_validate(item)

    async def update_thread(self, user_id: str, thread_id: str, **patch: Any) -> AgentThread:
        thread = await self.get_thread(user_id, thread_id)
        if thread is None:
            raise LookupError("Thread not found")

        updated = thread.model_copy(update={**patch, "updatedAt": utc_now_iso()})
        await self.threads_container.upsert_item(updated.model_dump(mode="json"))
        return updated

    async def delete_thread(self, user_id: str, thread_id: str) -> bool:
        try:
            await self.threads_container.delete_item(item=thread_id, partition_key=user_id)
            return True
        except exceptions.CosmosResourceNotFoundError:
            return False
        except exceptions.CosmosHttpResponseError as exc:
            logger.error("Failed to delete agent thread %s: %s", thread_id, exc)
            raise

    async def create_message(self, message: AgentMessage) -> AgentMessage:
        await self.messages_container.create_item(message.model_dump(mode="json"))
        return message

    async def list_messages(self, thread_id: str, limit: int = 100, newest_first: bool = False) -> list[AgentMessage]:
        direction = "DESC" if newest_first else "ASC"
        query = (
            "SELECT * FROM c WHERE c.threadId = @threadId "
            f"ORDER BY c.createdAt {direction} OFFSET 0 LIMIT @limit"
        )
        items = self.messages_container.query_items(
            query=query,
            parameters=[
                {"name": "@threadId", "value": thread_id},
                {"name": "@limit", "value": limit},
            ],
            partition_key=thread_id,
        )
        return [AgentMessage.model_validate(item) async for item in items]

    async def create_run(self, run: AgentRun) -> AgentRun:
        await self.runs_container.create_item(run.model_dump(mode="json"))
        return run

    async def list_runs(self, thread_id: str, limit: int = 50) -> list[AgentRun]:
        query = (
            "SELECT * FROM c WHERE c.threadId = @threadId "
            "ORDER BY c.startedAt DESC OFFSET 0 LIMIT @limit"
        )
        items = self.runs_container.query_items(
            query=query,
            parameters=[
                {"name": "@threadId", "value": thread_id},
                {"name": "@limit", "value": limit},
            ],
            partition_key=thread_id,
        )
        return [AgentRun.model_validate(item) async for item in items]

    async def get_run(self, thread_id: str, run_id: str) -> Optional[AgentRun]:
        try:
            item = await self.runs_container.read_item(item=run_id, partition_key=thread_id)
        except exceptions.CosmosResourceNotFoundError:
            return None
        except exceptions.CosmosHttpResponseError as exc:
            logger.error("Failed to load agent run %s: %s", run_id, exc)
            raise
        return AgentRun.model_validate(item)

    async def update_run(self, thread_id: str, run_id: str, **patch: Any) -> AgentRun:
        run = await self.get_run(thread_id, run_id)
        if run is None:
            raise LookupError("Run not found")

        updated = run.model_copy(update=patch)
        await self.runs_container.upsert_item(updated.model_dump(mode="json"))
        return updated

    async def create_events(self, events: list[AgentEvent]) -> list[AgentEvent]:
        if not events:
            return events
        await asyncio.gather(
            *(self.events_container.upsert_item(event.model_dump(mode="json")) for event in events)
        )
        return events

    async def list_events(self, thread_id: str, run_id: Optional[str] = None, limit: int = 2000) -> list[AgentEvent]:
        query = "SELECT * FROM c WHERE c.threadId = @threadId"
        parameters = [{"name": "@threadId", "value": thread_id}]
        if run_id:
            query += " AND c.runId = @runId"
            parameters.append({"name": "@runId", "value": run_id})
        query += " ORDER BY c.sequence ASC OFFSET 0 LIMIT @limit"
        parameters.append({"name": "@limit", "value": limit})

        items = self.events_container.query_items(
            query=query,
            parameters=parameters,
            partition_key=thread_id,
        )
        return [AgentEvent.model_validate(item) async for item in items]


_repository: Optional[AgentCosmosRepository] = None


async def init_agent_repository(client: CosmosClient) -> AgentCosmosRepository:
    """Called once during lifespan startup to wire the shared CosmosClient."""
    global _repository
    _repository = await AgentCosmosRepository.create(client)
    logger.info("AgentCosmosRepository initialized (shared async client)")
    return _repository


def close_agent_repository() -> None:
    """Called during lifespan shutdown."""
    global _repository
    _repository = None
    logger.info("AgentCosmosRepository reference cleared")


def get_agent_repository() -> AgentCosmosRepository:
    """Returns the lifespan-managed repository instance."""
    if _repository is None:
        raise RuntimeError(
            "AgentCosmosRepository is not initialised – the application lifespan has not run yet."
        )
    return _repository

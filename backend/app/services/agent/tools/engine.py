from __future__ import annotations

from curl_cffi import requests

from app.core.config import settings
from app.models.agent import Citation
from app.services.agent.state import ToolOutcome


class EngineAgentTools:
    async def evaluate_trade(
        self,
        *,
        user_id: str,
        ticker: str,
        lookback_days: int,
        auth_token: str | None,
    ) -> ToolOutcome:
        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        if settings.ENGINE_API_KEY:
            headers["X-Internal-API-Key"] = settings.ENGINE_API_KEY

        async with requests.AsyncSession() as session:
            response = await session.post(
                f"{settings.ENGINE_API_URL}{settings.API_V1_STR}/trading/evaluate",
                json={
                    "user_id": user_id,
                    "ticker": ticker.upper(),
                    "lookback_days": lookback_days,
                },
                headers=headers,
            )

        response.raise_for_status()
        payload = response.json()
        summary = (
            f"Engine evaluated {ticker.upper()} as {payload.get('action', 'UNKNOWN')} "
            f"with approval={payload.get('is_approved')}."
        )
        risk_flags: list[str] = []
        if not payload.get("is_approved", False):
            risk_flags.append("engine_not_approved")

        return ToolOutcome(
            name="evaluate_trade",
            summary=summary,
            payload=payload,
            citations=[
                Citation(
                    label=f"Engine evaluation: {ticker.upper()}",
                    source="engine",
                    kind="engine",
                    meta={
                        "ticker": ticker.upper(),
                        "action": payload.get("action"),
                        "approved": payload.get("is_approved"),
                    },
                )
            ],
            risk_flags=risk_flags,
        )

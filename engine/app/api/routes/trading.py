from fastapi import APIRouter, HTTPException, Depends, Request
from app.core.security import oauth2_scheme, get_current_user
from app.models.schemas import AIRecommendation, DecisionTraceStep, EvaluationRequest, OverrideRequest, TradeDecision
from app.utils.logger import get_engine_logger
from app.core.limiter import limiter

router = APIRouter()
logger = get_engine_logger("agos.engine.api.trading")

@router.post("/evaluate", response_model=TradeDecision)
@limiter.limit("10/minute")
async def evaluate_trade_endpoint(request: Request, payload: EvaluationRequest, token: str = Depends(oauth2_scheme), current_user: dict = Depends(get_current_user)):
    """
    Triggers the hybrid decision engine to evaluate a trade for a given ticker.
    This runs both the AI signal generation and Rule-Based safety gates.
    """
    if payload.user_id != current_user.get("uid") and current_user.get("uid") != "dev-admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.main import decision_engine
    if not decision_engine:
        raise HTTPException(status_code=503, detail="Decision engine is not initialized.")
        
    try:
        import time
        start_time = time.perf_counter()
        decision = await decision_engine.evaluate_trade(payload, token=token)
        end_time = time.perf_counter()
        decision.latency_ms = (end_time - start_time) * 1000
        return decision
    except Exception as e:
        logger.error("Trade evaluation failed", exc_info=True, extra={"extra_info": {"error": str(e), "ticker": payload.ticker}})
        raise HTTPException(status_code=500, detail="An internal evaluation error occurred.") from e

@router.post("/override", response_model=TradeDecision)
async def manual_override_endpoint(request: OverrideRequest, current_user: dict = Depends(get_current_user)):
    """
    Allows authorized manual override of trades. Still logs the reasoning for auditability.
    """
    if request.user_id != current_user.get("uid") and current_user.get("uid") != "dev-admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    logger.warning("Manual Trade Override Initiated", extra={"extra_info": {"override_details": request.model_dump()}})
    
    return TradeDecision(
        ticker=request.ticker,
        action=request.action,
        quantity=request.quantity,
        is_approved=True,
        ai_signal=AIRecommendation(
            action=request.action, 
            confidence_score=1.0, 
            reasoning="Manual Override"
        ),
        rule_gate_reasoning=f"Trade manually approved. Reason: {request.reason}",
        trace=[
            DecisionTraceStep(
                title="Manual Override",
                status="info",
                detail=f"User override approved {request.action.value} for {request.quantity} shares.",
                metrics={
                    "action": request.action.value,
                    "quantity": request.quantity,
                    "approved": True,
                },
            ),
            DecisionTraceStep(
                title="Audit Reason",
                status="done",
                detail=request.reason,
                metrics={"user_id": request.user_id},
            ),
        ],
    )

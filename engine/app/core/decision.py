from typing import Optional
from app.models.schemas import DecisionTraceStep, EvaluationRequest, TradeAction, TradeDecision
from app.core.data_provider import DataProvider
from app.services.strategy.ai import AIStrategyModule
from app.services.strategy.rules import RuleBasedModule
from app.utils.logger import get_engine_logger
from app.core.config import settings

logger = get_engine_logger(__name__)

class DecisionEngine:
    """
    Orchestrates the hybrid trading strategy.
    Combines Data Fetching -> AI Signal Generation -> Rule-Based Validation.
    """
    
    def __init__(self, pipeline=None, data_provider: DataProvider | None = None):
        self.data_provider = data_provider or DataProvider()
        self.ai_module = AIStrategyModule(pipeline=pipeline)
        self.rules_module = RuleBasedModule()
        self.MIN_AI_CONFIDENCE = settings.MIN_AI_CONFIDENCE  # Threshold for the AI signal to be considered

    async def evaluate_trade(self, request: EvaluationRequest, token: Optional[str] = None) -> TradeDecision:
        """
        Executes the full pipeline to generate a validated trade decision.
        """
        logger.info(f"Starting trade evaluation for {request.ticker}", extra={"extra_info": {"user_id": request.user_id}})
        trace: list[DecisionTraceStep] = []

        # 1. Fetch Data
        try:
            import asyncio
            fetch_history_task = self.data_provider.fetch_historical_prices(request.ticker, request.lookback_days, token=token)
            fetch_portfolio_task = self.data_provider.fetch_portfolio_state(request.user_id, token=token)
            historical_prices, portfolio_state = await asyncio.gather(fetch_history_task, fetch_portfolio_task)
            
            latest_close = historical_prices[-1].close if historical_prices else None
            trace.append(
                DecisionTraceStep(
                    title="Historical Data",
                    status="done",
                    detail=(
                        f"Loaded {len(historical_prices)} price points"
                        + (f". Latest close {latest_close:.2f}." if latest_close is not None else ".")
                    ),
                    metrics={
                        "lookback_days": request.lookback_days,
                        "points": len(historical_prices),
                        "latest_close": latest_close,
                    },
                )
            )
            trace.append(
                DecisionTraceStep(
                    title="Portfolio State",
                    status="done",
                    detail=(
                        f"Fetched {len(portfolio_state.positions)} positions with cash balance "
                        f"{portfolio_state.cash_balance:.2f}."
                    ),
                    metrics={
                        "positions": len(portfolio_state.positions),
                        "cash_balance": portfolio_state.cash_balance,
                        "total_value": portfolio_state.total_value,
                    },
                )
            )
        except Exception as e:
            logger.error("Data fetching failed during evaluation", exc_info=True, extra={"extra_info": {"error": str(e), "ticker": request.ticker}})
            raise

        # 2. Generate AI Signal
        ai_recommendation = await self.ai_module.generate_signal(request.ticker, historical_prices)
        trace.append(
            DecisionTraceStep(
                title="AI Signal",
                status="done",
                detail=(
                    f"Model suggested {ai_recommendation.action.value} at "
                    f"{ai_recommendation.confidence_score * 100:.1f}% confidence."
                ),
                metrics={
                    "action": ai_recommendation.action.value,
                    "confidence": ai_recommendation.confidence_score,
                    "threshold": self.MIN_AI_CONFIDENCE,
                },
            )
        )
        logger.info(f"AI generated signal: {ai_recommendation.action.value}", extra={"extra_info": {"confidence": ai_recommendation.confidence_score}})

        # 3. Decision Logic & Rule-Based Validation
        is_approved = False
        rule_reasoning = ""
        suggested_quantity = 0.0
        current_price = historical_prices[-1].close if historical_prices else None

        if ai_recommendation.action == TradeAction.HOLD:
            rule_reasoning = "AI suggested HOLD. No further action taken."
            is_approved = True  # Holding is always approved
            trace.append(
                DecisionTraceStep(
                    title="Rule Gate",
                    status="info",
                    detail=rule_reasoning,
                    metrics={
                        "approved": is_approved,
                        "suggested_quantity": suggested_quantity,
                    },
                )
            )
            
        elif ai_recommendation.confidence_score < self.MIN_AI_CONFIDENCE:
            rule_reasoning = f"AI confidence ({ai_recommendation.confidence_score:.2f}) below threshold ({self.MIN_AI_CONFIDENCE}). Defaulting to HOLD."
            ai_recommendation.action = TradeAction.HOLD
            is_approved = True
            trace.append(
                DecisionTraceStep(
                    title="Confidence Gate",
                    status="warn",
                    detail=rule_reasoning,
                    metrics={
                        "confidence": ai_recommendation.confidence_score,
                        "threshold": self.MIN_AI_CONFIDENCE,
                        "approved": is_approved,
                    },
                )
            )
            
        else:
            # AI suggests an action with high confidence, pass to Rule-Based Gate
            logger.info("AI confidence meets threshold. Passing to Rule-Based Safety Gate.")
            is_approved, rule_reasoning, suggested_quantity = self.rules_module.validate_trade(
                ticker=request.ticker,
                action=ai_recommendation.action,
                prices=historical_prices,
                portfolio=portfolio_state
            )
            trace.append(
                DecisionTraceStep(
                    title="Rule Gate",
                    status="done" if is_approved else "blocked",
                    detail=(
                        f"{rule_reasoning}"
                        + (f" Suggested quantity: {suggested_quantity:.0f}." if suggested_quantity > 0 else "")
                    ),
                    metrics={
                        "approved": is_approved,
                        "suggested_quantity": suggested_quantity,
                        "portfolio_positions": len(portfolio_state.positions),
                    },
                )
            )
            
            if not is_approved:
                 logger.warning(f"Trade blocked by Safety Gate: {rule_reasoning}")

        # Construct final decision
        final_action = ai_recommendation.action if is_approved else TradeAction.HOLD
        trace.append(
            DecisionTraceStep(
                title="Final Decision",
                status="done" if is_approved else "blocked",
                detail=(
                    f"Returned {final_action.value}"
                    + (f" for {suggested_quantity:.0f} shares." if suggested_quantity > 0 else ".")
                ),
                metrics={
                    "action": final_action.value,
                    "approved": is_approved,
                    "quantity": suggested_quantity,
                    "target_price": current_price,
                },
            )
        )
        decision = TradeDecision(
            ticker=request.ticker,
            action=final_action, # Revert to HOLD if blocked
            quantity=suggested_quantity,
            target_price=current_price,
            is_approved=is_approved,
            ai_signal=ai_recommendation,
            rule_gate_reasoning=rule_reasoning,
            trace=trace,
        )
        
        logger.info("Trade evaluation complete.", extra={"extra_info": {"final_decision": decision.model_dump()}})
        return decision

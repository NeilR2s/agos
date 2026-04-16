from enum import Enum
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class TradeAction(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class PriceDataPoint(BaseModel):
    timestamp: str
    close: float
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    volume: Optional[float] = None


class PortfolioPosition(BaseModel):
    ticker: str
    quantity: float
    average_price: float
    current_value: float


class PortfolioState(BaseModel):
    user_id: str
    cash_balance: float
    positions: Dict[str, PortfolioPosition]
    total_value: float


class EvaluationRequest(BaseModel):
    user_id: str
    ticker: str
    lookback_days: int = Field(default=30, ge=14, le=365)


class AIRecommendation(BaseModel):
    action: TradeAction
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    reasoning: str


class DecisionTraceStep(BaseModel):
    title: str
    status: str
    detail: str
    metrics: Optional[Dict[str, Any]] = None


class TradeDecision(BaseModel):
    ticker: str
    action: TradeAction
    quantity: float = 0.0
    target_price: Optional[float] = None
    is_approved: bool
    ai_signal: AIRecommendation
    rule_gate_reasoning: str
    portfolio_impact: Optional[Dict[str, Any]] = None
    trace: Optional[List[DecisionTraceStep]] = None
    latency_ms: Optional[float] = None


class OverrideRequest(BaseModel):
    user_id: str
    ticker: str
    action: TradeAction
    quantity: int
    reason: str

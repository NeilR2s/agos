from contextlib import asynccontextmanager
import os

import pandas as pd
import torch
from chronos import Chronos2Pipeline
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from models.schemas import EvaluationRequest, TradeDecision, OverrideRequest, TradeAction, AIRecommendation
from core.decision import DecisionEngine
from utils.logger import get_engine_logger
from core.config import settings

app_logger = get_engine_logger("agos.engine.api")

# Global pipeline and engine variables
pipeline = None
decision_engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    global decision_engine
    
    model_path = settings.MODEL_PATH
    app_logger.info(f"Loading model from {model_path} on CPU...")

    # Force load onto CPU for Azure constraints
    pipeline = Chronos2Pipeline.from_pretrained(model_path, device_map="cpu")

    # Memory optimization: Apply PyTorch 8-bit dynamic quantization to linear layers
    # This reduces RAM consumption by ~4x, allowing it to run within strict Azure bounds
    app_logger.info("Applying 8-bit dynamic quantization to linear layers...")
    pipeline.model = torch.ao.quantization.quantize_dynamic(
        pipeline.model, {torch.nn.Linear}, dtype=torch.qint8
    )
    app_logger.info("Model loaded and quantized successfully.")

    # Initialize the decision engine with the real model pipeline
    decision_engine = DecisionEngine(pipeline=pipeline)
    app_logger.info("DecisionEngine initialized successfully with real model.")
    
    yield
    
    # Shutdown logic: Close data provider connections
    if decision_engine and decision_engine.data_provider:
        await decision_engine.data_provider.close()
        app_logger.info("Decision engine data provider closed.")

app = FastAPI(
    title="AGOS Trading Engine & Forecasting API",
    description="Unified API for time-series forecasting and hybrid rule/AI trading logic.",
    version="1.1.0",
    lifespan=lifespan
)


class ForecastRequest(BaseModel):
    history: list[float] = Field(
        ...,
        description="Historical price data points (minimum 10 recommended).",
        json_schema_extra={"example": [10.5, 11.2, 10.8, 12.1, 11.5, 12.0, 11.8, 12.5, 13.0, 12.8]},
    )
    prediction_length: int = Field(
        24, description="Number of future steps to forecast.", ge=1, le=512, json_schema_extra={"example": 24}
    )
    quantiles: list[float] = Field(
        [0.1, 0.5, 0.9],
        description="Quantile levels for probabilistic forecasting.",
        json_schema_extra={"example": [0.1, 0.5, 0.9]},
    )


class ForecastResponse(BaseModel):
    forecasts: dict[str, list[float]] = Field(
        ...,
        description="Dictionary mapping quantiles to predicted value lists.",
        json_schema_extra={"example": {
            "q_0.1": [12.5, 12.4],
            "q_0.5": [13.1, 13.2],
            "q_0.9": [13.8, 14.1],
        }},
    )


@app.get("/health", tags=["System"])
def health_check():
    """Returns the status of the API and model loading."""
    return {
        "status": "online" if pipeline is not None else "loading",
        "model": settings.MODEL_PATH
}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(request: ForecastRequest):
    """
    Accepts historical price data and returns quantile predictions.
    """
    if len(request.history) < 10:
        raise HTTPException(status_code=400, detail="History must contain at least 10 data points.")

    try:
        # Convert raw history list into a DataFrame formatted for Chronos2 predict_df API
        # Chronos doesn't strictly depend on physical timestamps
        df = pd.DataFrame(
            {
                "timestamp": pd.date_range(
                    start="2023-01-01", periods=len(request.history), freq="D"
                ),
                "target": request.history,
                "id": "pse_stock",  # Batch identifier
            }
        )

        # Predict
        pred_df = pipeline.predict_df(
            df,
            prediction_length=request.prediction_length,
            quantile_levels=request.quantiles,
            id_column="id",
            timestamp_column="timestamp",
            target="target",
        )

        # Extract desired quantiles and format as a dictionary
        result = {}
        for q in request.quantiles:
            result[f"q_{q}"] = pred_df[str(q)].tolist()

        return ForecastResponse(forecasts=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/evaluate", response_model=TradeDecision, tags=["Trading"])
async def evaluate_trade_endpoint(request: EvaluationRequest):
    """
    Triggers the hybrid decision engine to evaluate a trade for a given ticker.
    This runs both the AI signal generation and Rule-Based safety gates.
    """
    if not decision_engine:
        raise HTTPException(status_code=503, detail="Decision engine is not initialized.")
        
    try:
        decision = await decision_engine.evaluate_trade(request)
        return decision
    except Exception as e:
        app_logger.error("Trade evaluation failed", exc_info=True, extra={"extra_info": {"error": str(e), "ticker": request.ticker}})
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}") from e


@app.post("/override", response_model=TradeDecision, tags=["Trading"])
async def manual_override_endpoint(request: OverrideRequest):
    """
    Allows authorized manual override of trades. Still logs the reasoning for auditability.
    """
    app_logger.warning("Manual Trade Override Initiated", extra={"extra_info": {"override_details": request.model_dump()}})
    
    # In a real system, you would check permissions here.
    
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
        rule_gate_reasoning=f"Trade manually approved. Reason: {request.reason}"
    )


# Running instructions:
# uvicorn app:app --host 0.0.0.0 --port 5000

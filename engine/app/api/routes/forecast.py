import pandas as pd
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from app.core.limiter import limiter

router = APIRouter()

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
            "q_0.9": [13.8, 14.1],
        }},
    )

@router.post("/", response_model=ForecastResponse)
@limiter.limit("10/minute")
def forecast(request: Request, payload: ForecastRequest):
    """
    Accepts historical price data and returns quantile predictions.
    """
    from app.main import pipeline
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model pipeline is not initialized.")

    if len(payload.history) < 10:
        raise HTTPException(status_code=400, detail="History must contain at least 10 data points.")

    try:
        # Convert raw history list into a DataFrame formatted for Chronos2 predict_df API
        df = pd.DataFrame(
            {
                "timestamp": pd.date_range(
                    start="2023-01-01", periods=len(payload.history), freq="D"
                ),
                "target": payload.history,
                "id": "pse_stock",  # Batch identifier
            }
        )

        # Predict
        pred_df = pipeline.predict_df(
            df,
            prediction_length=payload.prediction_length,
            quantile_levels=payload.quantiles,
            id_column="id",
            timestamp_column="timestamp",
            target="target",
        )

        # Extract desired quantiles and format as a dictionary
        result = {}
        for q in payload.quantiles:
            result[f"q_{q}"] = pred_df[str(q)].tolist()

        return ForecastResponse(forecasts=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

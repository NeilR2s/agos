import pandas as pd
from typing import List, Optional
from app.models.schemas import AIRecommendation, TradeAction, PriceDataPoint
from app.utils.logger import get_engine_logger

logger = get_engine_logger(__name__)

class AIStrategyModule:
    """
    AI Inference service using Chronos time-series forecasting.
    Generates trade signals based on predicted price trajectories.
    """
    
    def __init__(self, pipeline=None):
        self.pipeline = pipeline
        if self.pipeline:
            logger.info("AIStrategyModule initialized with real Chronos pipeline.")
        else:
            logger.warning("AIStrategyModule initialized WITHOUT pipeline. Signals will default to HOLD.")

    async def generate_signal(self, ticker: str, historical_prices: List[PriceDataPoint]) -> AIRecommendation:
        """
        Analyzes historical price data using the Chronos model and returns a trade recommendation.
        """
        if not self.pipeline:
            return AIRecommendation(
                action=TradeAction.HOLD,
                confidence_score=0.0,
                reasoning="AI pipeline not initialized. Defaulting to safe HOLD."
            )

        if len(historical_prices) < 14:
            return AIRecommendation(
                action=TradeAction.HOLD,
                confidence_score=0.5,
                reasoning="Insufficient data points for reliable AI forecasting (minimum 14 required)."
            )

        try:
            # Prepare data for Chronos
            history_values = [p.close for p in historical_prices]
            df = pd.DataFrame({
                "timestamp": pd.date_range(start="2000-01-01", periods=len(history_values), freq="D"),
                "target": history_values,
                "id": ticker
            })

            # Forecast 5 days ahead
            prediction_length = 5
            quantiles = [0.1, 0.5, 0.9]
            
            # Note: predict_df is synchronous in current Chronos implementation
            pred_df = self.pipeline.predict_df(
                df,
                prediction_length=prediction_length,
                quantile_levels=quantiles,
                id_column="id",
                timestamp_column="timestamp",
                target="target",
            )

            # Analyze forecast
            current_price = history_values[-1]
            predicted_median = pred_df["0.5"].iloc[-1]
            predicted_lower = pred_df["0.1"].iloc[-1]
            predicted_upper = pred_df["0.9"].iloc[-1]

            expected_return = (predicted_median - current_price) / current_price
            
            # Confidence based on quantile spread (lower spread = higher confidence)
            # Normalize spread by price to get a relative uncertainty measure
            spread = (predicted_upper - predicted_lower) / current_price
            confidence = max(0.0, 1.0 - spread)

            # Signal logic based on industry standard return thresholds
            # Thresholds can be tuned; using 2% for BUY/SELL signals
            buy_threshold = 0.02
            sell_threshold = -0.02

            if expected_return > buy_threshold:
                action = TradeAction.BUY
                reasoning = (f"AI predicts {expected_return*100:.2f}% growth over next {prediction_length} days. "
                             f"Target price: {predicted_median:.2f}. Relative uncertainty: {spread:.2f}.")
            elif expected_return < sell_threshold:
                action = TradeAction.SELL
                reasoning = (f"AI predicts {abs(expected_return)*100:.2f}% decline over next {prediction_length} days. "
                             f"Target price: {predicted_median:.2f}. Relative uncertainty: {spread:.2f}.")
            else:
                action = TradeAction.HOLD
                reasoning = (f"AI predicts minimal movement ({expected_return*100:.2f}%) within {prediction_length} days. "
                             "Awaiting stronger directional signal.")

            return AIRecommendation(
                action=action,
                confidence_score=round(confidence, 4),
                reasoning=reasoning
            )

        except Exception as e:
            logger.error(f"AI Signal Generation failed for {ticker}", exc_info=True)
            return AIRecommendation(
                action=TradeAction.HOLD,
                confidence_score=0.0,
                reasoning=f"AI inference error: {str(e)}"
            )

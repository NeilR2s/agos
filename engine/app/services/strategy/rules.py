import pandas as pd
from typing import List, Tuple
from app.models.schemas import PriceDataPoint, PortfolioState, TradeAction
from app.utils.logger import get_engine_logger
from app.core.config import settings

logger = get_engine_logger(__name__)

class RuleBasedModule:
    """
    Deterministic quantitative strategy and risk management safety gate.
    Uses pandas to calculate technical indicators and evaluates portfolio constraints.
    """
    
    def __init__(self):
        # Risk Parameters
        self.MAX_PORTFOLIO_ALLOCATION_PER_TICKER = settings.MAX_PORTFOLIO_ALLOCATION_PER_TICKER
        self.RSI_PERIOD = settings.RSI_PERIOD
        self.RSI_OVERBOUGHT = settings.RSI_OVERBOUGHT
        self.RSI_OVERSOLD = settings.RSI_OVERSOLD

    def validate_trade(self, ticker: str, action: TradeAction, prices: List[PriceDataPoint], portfolio: PortfolioState) -> Tuple[bool, str, float]:
        """
        Validates an AI-suggested trade against technical indicators and portfolio risk limits.
        Returns: (is_approved, reasoning, suggested_quantity)
        """
        if not prices:
            return False, "No historical price data available for technical analysis.", 0

        if action == TradeAction.HOLD:
            return True, "Hold action automatically approved.", 0

        # 1. Technical Analysis Gate
        df = pd.DataFrame({"close": [p.close for p in prices]})
        
        # Calculate RSI (using Wilder's Smoothing / EMA)
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = -delta.where(delta < 0, 0.0)

        # Using EWM to approximate Wilder's Moving Average
        avg_gain = gain.ewm(alpha=1/self.RSI_PERIOD, adjust=False, min_periods=self.RSI_PERIOD).mean()
        avg_loss = loss.ewm(alpha=1/self.RSI_PERIOD, adjust=False, min_periods=self.RSI_PERIOD).mean()
        
        # Handle division by zero (avg_loss == 0)
        rs = avg_gain / avg_loss
        df['rsi'] = 100.0 - (100.0 / (1.0 + rs.fillna(0))) # Fillna(0) for rs handles the case where avg_loss is 0
        
        # If both avg_gain and avg_loss are 0, RSI should be 50 (neutral)
        df.loc[(avg_gain == 0) & (avg_loss == 0), 'rsi'] = 50.0
        
        current_rsi = df['rsi'].iloc[-1]
        current_price = df['close'].iloc[-1]
        
        if pd.isna(current_rsi):
            return False, f"Insufficient data to calculate RSI (needs at least {self.RSI_PERIOD} days of historical movement).", 0

        logger.info(f"Calculated Indicators for {ticker}", extra={"extra_info": {"current_price": current_price, "rsi": current_rsi}})

        if action == TradeAction.BUY and current_rsi >= self.RSI_OVERBOUGHT:
            return False, f"Technical Gate Blocked: Asset is overbought (RSI = {current_rsi:.2f} >= {self.RSI_OVERBOUGHT}).", 0
            
        if action == TradeAction.SELL and current_rsi <= self.RSI_OVERSOLD:
            return False, f"Technical Gate Blocked: Asset is oversold (RSI = {current_rsi:.2f} <= {self.RSI_OVERSOLD}). Consider holding.", 0

        # 2. Portfolio Risk Gate
        current_position = portfolio.positions.get(ticker)
        current_position_value = current_position.current_value if current_position else 0.0
        
        if action == TradeAction.BUY:
            max_allowed_value = portfolio.total_value * self.MAX_PORTFOLIO_ALLOCATION_PER_TICKER
            available_allocation = max_allowed_value - current_position_value
            
            if available_allocation <= 0:
                return False, f"Risk Gate Blocked: Maximum allocation ({self.MAX_PORTFOLIO_ALLOCATION_PER_TICKER*100}%) reached for {ticker}.", 0
                
            # Suggest quantity based on available allocation and cash, whichever is lower
            investable_amount = min(available_allocation, portfolio.cash_balance)
            suggested_quantity = float(investable_amount // current_price)
            
            if suggested_quantity == 0:
                 return False, "Risk Gate Blocked: Insufficient funds to purchase even 1 share.", 0.0
                 
            return True, f"Trade Validated: RSI is {current_rsi:.2f} (acceptable). Suggested allocation within risk limits.", suggested_quantity

        elif action == TradeAction.SELL:
            if not current_position or current_position.quantity == 0:
                return False, f"Risk Gate Blocked: No existing position to sell for {ticker}.", 0
                
            # For simplicity, suggest selling the entire position
            suggested_quantity = current_position.quantity
            return True, f"Trade Validated: RSI is {current_rsi:.2f} (acceptable). Approved to liquidate position.", suggested_quantity

        return False, "Unknown action.", 0

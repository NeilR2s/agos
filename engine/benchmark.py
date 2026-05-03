import asyncio
import time
import random
import pandas as pd
from app.models.schemas import EvaluationRequest, PriceDataPoint, PortfolioState, PortfolioPosition, TradeAction
from app.services.strategy.rules import RuleBasedModule

def benchmark_rules():
    # Generate some fake prices (100 days)
    mock_prices = [
        PriceDataPoint(timestamp=f"2023-01-{i:02d}", close=100.0 + random.uniform(-2, 2))
        for i in range(1, 101)
    ]
    
    # Fake portfolio
    mock_portfolio = PortfolioState(
        user_id="user_123",
        cash_balance=50000.0,
        positions={"AAPL": PortfolioPosition(ticker="AAPL", quantity=10, average_price=100.0, current_value=1050.0)},
        total_value=51050.0
    )

    rules_module = RuleBasedModule()
    action = TradeAction.BUY

    # OLD WAY:
    # df = pd.DataFrame([p.model_dump() for p in prices])
    start = time.perf_counter()
    for _ in range(1000):
        df_old = pd.DataFrame([p.model_dump() for p in mock_prices])
        df_old['close'] = pd.to_numeric(df_old['close'])
    old_time = time.perf_counter() - start
    
    # NEW WAY:
    # df = pd.DataFrame({"close": [p.close for p in prices]})
    start = time.perf_counter()
    for _ in range(1000):
        df_new = pd.DataFrame({"close": [p.close for p in mock_prices]})
    new_time = time.perf_counter() - start

    print(f"Pydantic -> DataFrame Old Method (1000 iterations): {old_time:.4f}s")
    print(f"Pydantic -> DataFrame New Method (1000 iterations): {new_time:.4f}s")
    print(f"Speedup: {old_time / new_time:.2f}x")

if __name__ == "__main__":
    benchmark_rules()

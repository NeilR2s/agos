import pytest
from app.services.strategy.rules import RuleBasedModule
from app.models.schemas import PriceDataPoint, PortfolioState, TradeAction, PortfolioPosition
from datetime import datetime, UTC, timedelta

@pytest.fixture
def rules_module():
    return RuleBasedModule()

@pytest.fixture
def mock_prices():
    prices = []
    # 20 days of flat price at 100
    for i in range(20):
        prices.append(PriceDataPoint(
            timestamp=(datetime.now(UTC) - timedelta(days=20-i)).strftime("%Y-%m-%d"),
            close=100.0,
            open=100.0,
            high=100.0,
            low=100.0,
            volume=1000
        ))
    return prices

@pytest.fixture
def mock_portfolio():
    return PortfolioState(
        user_id="test_user",
        cash_balance=10000.0,
        positions={},
        total_value=10000.0
    )

def test_rsi_neutral_on_flat_price(rules_module, mock_prices, mock_portfolio):
    is_approved, reasoning, quantity = rules_module.validate_trade(
        "TEST", TradeAction.BUY, mock_prices, mock_portfolio
    )
    # With flat price, RSI should be 50.
    assert "RSI is 50.00" in reasoning
    assert is_approved is True

def test_rsi_overbought(rules_module, mock_prices, mock_portfolio):
    # Make price shoot up
    for i in range(10):
        mock_prices.append(PriceDataPoint(
            timestamp=datetime.now(UTC).strftime("%Y-%m-%d"),
            close=200.0 + i*10,
            open=200.0,
            high=300.0,
            low=100.0,
            volume=1000
        ))
    
    is_approved, reasoning, quantity = rules_module.validate_trade(
        "TEST", TradeAction.BUY, mock_prices, mock_portfolio
    )
    assert is_approved is False
    assert "Asset is overbought" in reasoning

def test_risk_gate_allocation_limit(rules_module, mock_prices, mock_portfolio):
    # Set a large position already
    mock_portfolio.positions["TEST"] = PortfolioPosition(
        ticker="TEST",
        quantity=20,
        average_price=100.0,
        current_value=2000.0 # 20% of 10000
    )
    
    is_approved, reasoning, quantity = rules_module.validate_trade(
        "TEST", TradeAction.BUY, mock_prices, mock_portfolio
    )
    assert is_approved is False
    assert "Maximum allocation" in reasoning

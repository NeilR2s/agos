from app.db.cosmos import get_db
from app.services.scraper import PSEService
from app.models.domain import Holding, Portfolio
import asyncio

class PortfolioService:
    def __init__(self):
        self.db = get_db()
        self.scraper = PSEService()

    async def get_user_portfolio(self, user_id: str) -> Portfolio:
        data = await self.db.get_portfolio(user_id)
        
        # Only include explicit holding records
        holdings_data = [item for item in data if item.get('type') == 'holding' and 'ticker' in item]
        cash_data = next((item for item in data if item.get('type') == 'cash' or item.get('id') == f"{user_id}_cash"), None)
        
        liquid_cash = cash_data['amount'] if cash_data else 0.0
        total_market_value = 0.0
        total_cost = 0.0
        has_unknown_cost_basis = False

        # Fetch prices in parallel
        tasks = [self.enrich_holding(h) for h in holdings_data]
        holdings = await asyncio.gather(*tasks)
        
        for h in holdings:
            total_market_value += h.marketValue or 0
            total_cost += (h.avgPrice * h.shares)
            if h.shares > 0 and h.avgPrice <= 0:
                has_unknown_cost_basis = True
            
        total_gain_loss = None if has_unknown_cost_basis else total_market_value - total_cost
        total_gain_loss_percent = None
        if not has_unknown_cost_basis:
            total_gain_loss_percent = (total_gain_loss / total_cost * 100) if total_cost > 0 else 0
        total_portfolio_value = total_market_value + liquid_cash
        
        return Portfolio(
            userId=user_id,
            holdings=list(holdings),
            liquidCash=liquid_cash,
            totalMarketValue=total_market_value,
            totalPortfolioValue=total_portfolio_value,
            totalGainLoss=total_gain_loss,
            totalGainLossPercent=total_gain_loss_percent
        )

    async def get_holding(self, user_id: str, ticker: str) -> Holding:
        h_data = await self.db.get_holding(user_id, ticker)
        if not h_data:
            return None
        return await self.enrich_holding(h_data)

    async def enrich_holding(self, h_data) -> Holding:
        ticker = h_data['ticker']
        details = await self.scraper.get_ticker_details(ticker)
        current_price = details['price'] if details else None
        
        market_value = 0
        gain_loss = None
        gain_loss_percent = None
        
        if current_price is not None:
            market_value = current_price * h_data['shares']

            # Prevent divide-by-zero if shares are zero
            cost_basis = h_data['avgPrice'] * h_data['shares']
            if cost_basis > 0:
                gain_loss = market_value - cost_basis
                gain_loss_percent = (gain_loss / cost_basis) * 100
        
        return Holding(
            id=h_data['id'],
            userId=h_data['userId'],
            ticker=ticker,
            shares=h_data['shares'],
            avgPrice=h_data['avgPrice'],
            currentPrice=current_price,
            marketValue=market_value,
            gainLoss=gain_loss,
            gainLossPercent=gain_loss_percent
        )

    async def add_holding(self, user_id: str, ticker: str, shares: float, avg_price: float):
        return await self.db.upsert_holding(user_id, ticker, shares, avg_price)

    async def update_holding(self, user_id: str, ticker: str, shares: float = None, avg_price: float = None):
        existing = await self.db.get_holding(user_id, ticker)
        if not existing:
            return None
        
        new_shares = shares if shares is not None else existing['shares']
        new_avg_price = avg_price if avg_price is not None else existing['avgPrice']
        
        return await self.db.upsert_holding(user_id, ticker, new_shares, new_avg_price)

    async def remove_holding(self, user_id: str, ticker: str):
        return await self.db.delete_holding(user_id, ticker)

    async def get_cash(self, user_id: str):
        return await self.db.get_cash(user_id)

    async def update_cash(self, user_id: str, amount: float):
        return await self.db.upsert_cash(user_id, amount)

    async def remove_cash(self, user_id: str):
        return await self.db.delete_cash(user_id)

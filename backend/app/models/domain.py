from pydantic import BaseModel, Field
from typing import List, Optional

class HoldingBase(BaseModel):
    ticker: str
    shares: float
    avgPrice: float = Field(..., gt=0)

class HoldingCreate(HoldingBase):
    pass

class HoldingUpdate(BaseModel):
    shares: Optional[float] = None
    avgPrice: Optional[float] = Field(default=None, gt=0)

class Holding(HoldingBase):
    id: str
    userId: str
    currentPrice: Optional[float] = None
    marketValue: Optional[float] = None
    gainLoss: Optional[float] = None
    gainLossPercent: Optional[float] = None

class Cash(BaseModel):
    amount: float

class CashUpdate(BaseModel):
    amount: float

class Portfolio(BaseModel):
    userId: str
    holdings: List[Holding]
    liquidCash: float
    totalMarketValue: float
    totalPortfolioValue: float
    totalGainLoss: Optional[float] = None
    totalGainLossPercent: Optional[float] = None

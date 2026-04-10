import os
from datetime import UTC, datetime

from dotenv import load_dotenv
from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

load_dotenv()


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """Provides a standardized scraped_at column."""

    scraped_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))


class PSEStockData(Base, TimestampMixin):
    """Stores historical daily stock data for companies listed on the PSE."""

    __tablename__ = "pse_stock_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    hash: Mapped[str] = mapped_column(String, unique=True, index=True)  # sha256(date + ticker)

    date: Mapped[str] = mapped_column(String, nullable=False)  # YYYY-MM-DD format
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    company_name: Mapped[str | None] = mapped_column(String)

    # Technical Indicators
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float | None] = mapped_column(Float)
    average_price: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    value: Mapped[float | None] = mapped_column(Float)

    # Fundamental / Other Stats
    week_52_high: Mapped[float | None] = mapped_column(Float)
    week_52_low: Mapped[float | None] = mapped_column(Float)
    market_cap: Mapped[float | None] = mapped_column(Float)
    outstanding_shares: Mapped[float | None] = mapped_column(Float)
    free_float_level: Mapped[float | None] = mapped_column(Float)
    change_pct: Mapped[float | None] = mapped_column(Float)

    # Details & Additional info
    status: Mapped[str | None] = mapped_column(String)
    issue_type: Mapped[str | None] = mapped_column(String)
    isin: Mapped[str | None] = mapped_column(String)
    listing_date: Mapped[str | None] = mapped_column(String)
    listed_shares: Mapped[float | None] = mapped_column(Float)
    issued_shares: Mapped[float | None] = mapped_column(Float)
    board_lot: Mapped[float | None] = mapped_column(Float)
    par_value: Mapped[float | None] = mapped_column(Float)
    foreign_ownership_limit: Mapped[float | None] = mapped_column(Float)
    previous_close: Mapped[float | None] = mapped_column(Float)


class MacroData(Base, TimestampMixin):
    """Generic table for macroeconomic indicators (GDP, Inflation, Key Rates)."""

    __tablename__ = "macro_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # sha256(date + source + category + indicator)
    hash: Mapped[str] = mapped_column(String, unique=True, index=True)

    date: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    indicator: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[float | None] = mapped_column(Float)


# Configuration from .env
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///trading_data.db")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db():
    """Initializes the database schema by creating all defined tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db_session():
    """Async generator providing a scoped database session."""
    async with AsyncSessionLocal() as session:
        yield session

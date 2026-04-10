import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine

from db import Base


@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.mark.asyncio
async def test_database_initialization(test_engine):
    """Test that all tables are created correctly in the SQLite db."""
    async with test_engine.connect() as conn:
        def get_tables(connection):
            from sqlalchemy import inspect
            inspector = inspect(connection)
            return inspector.get_table_names()

        tables = await conn.run_sync(get_tables)

    expected_tables = {'pse_stock_data', 'macro_data'}
    assert expected_tables.issubset(set(tables))

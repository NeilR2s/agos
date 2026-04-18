from unittest.mock import AsyncMock, patch

import pytest

from db import CONTAINERS, init_db


@pytest.mark.asyncio
async def test_init_db():
    with patch("db.CosmosClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client

        mock_db = AsyncMock()
        mock_client.create_database_if_not_exists.return_value = mock_db

        await init_db()

        mock_client.create_database_if_not_exists.assert_called_once()
        assert mock_db.create_container_if_not_exists.call_count == len(CONTAINERS)

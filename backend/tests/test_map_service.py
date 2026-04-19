import pytest
from app.services.map_service import BBox, close_polygon, filter_map_features


class FakeMapDb:
    async def list_map_assets(self):
        return []

    async def list_map_zones(self):
        return []

    async def list_map_connections(self):
        return []

    async def list_map_tracks(self):
        return []

    async def list_map_events(self):
        return []


@pytest.mark.asyncio
async def test_filter_map_features_uses_seed_fallback_for_bbox_queries():
    payload = await filter_map_features(
        db=FakeMapDb(),
        search="MANILA",
        bounds=BBox(west=120.9, south=14.5, east=121.05, north=14.65),
    )

    assert any(asset["id"] == "asset-manila-port" for asset in payload["assets"])
    assert payload["timeline"]


@pytest.mark.asyncio
async def test_filter_map_features_filters_polygon_intersections():
    payload = await filter_map_features(
        db=FakeMapDb(),
        search="",
        polygon=close_polygon([
            [120.95, 14.58],
            [120.99, 14.58],
            [120.99, 14.61],
            [120.95, 14.61],
        ]),
    )

    assert any(zone["id"] == "zone-manila-port" for zone in payload["zones"])
    assert any(connection["id"] == "conn-port-makati" for connection in payload["connections"])

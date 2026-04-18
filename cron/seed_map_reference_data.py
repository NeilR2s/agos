from datetime import UTC, datetime

from map_reference_data import MAP_ASSETS, MAP_CONNECTIONS, MAP_REGION, MAP_TRACKS, MAP_ZONES


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def with_metadata(item: dict, *, item_type: str) -> dict:
    now = utc_now_iso()
    return {
        **item,
        "type": item_type,
        "source": "seed",
        "region": MAP_REGION,
        "createdAt": now,
        "updatedAt": now,
    }


async def seed_map_reference_data(db_client, settings):
    container_specs = [
        (settings.COSMOS_MAP_ASSETS_CONTAINER, "asset", MAP_ASSETS),
        (settings.COSMOS_MAP_ZONES_CONTAINER, "zone", MAP_ZONES),
        (settings.COSMOS_MAP_CONNECTIONS_CONTAINER, "connection", MAP_CONNECTIONS),
        (settings.COSMOS_MAP_TRACKS_CONTAINER, "track", MAP_TRACKS),
    ]

    for container_name, item_type, items in container_specs:
        container = db_client.get_container_client(container_name)
        for item in items:
            payload = with_metadata(item, item_type=item_type)
            if item_type == "track":
                payload.pop("region", None)
            await container.upsert_item(payload)

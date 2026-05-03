from __future__ import annotations

import asyncio
from typing import Any

from app.db.cosmos import CosmosDB
from app.services.map_data import MAP_ASSETS, MAP_CONNECTIONS, MAP_EVENTS, MAP_TIMELINE, MAP_TRACKS, MAP_ZONES


class BBox:
    def __init__(self, *, west: float, south: float, east: float, north: float):
        self.west = west
        self.south = south
        self.east = east
        self.north = north


def close_polygon(coordinates: list[list[float]]) -> list[list[float]]:
    if not coordinates:
        return coordinates
    if coordinates[0] == coordinates[-1]:
        return coordinates
    return [*coordinates, coordinates[0]]


def point_in_bounds(point: list[float], bounds: BBox) -> bool:
    lng, lat = point
    return bounds.west <= lng <= bounds.east and bounds.south <= lat <= bounds.north


def get_bounds_from_coordinates(coordinates: list[list[float]]) -> BBox:
    lngs = [coordinate[0] for coordinate in coordinates]
    lats = [coordinate[1] for coordinate in coordinates]
    return BBox(west=min(lngs), south=min(lats), east=max(lngs), north=max(lats))


def bbox_intersects(left: BBox, right: BBox) -> bool:
    return not (
        left.east < right.west
        or left.west > right.east
        or left.north < right.south
        or left.south > right.north
    )


def point_in_polygon(point: list[float], polygon: list[list[float]]) -> bool:
    x, y = point
    inside = False
    for index in range(len(polygon)):
        prev_index = (index - 1) % len(polygon)
        xi, yi = polygon[index]
        xj, yj = polygon[prev_index]
        intersects = (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi)) / ((yj - yi) or 1e-12) + xi
        if intersects:
            inside = not inside
    return inside


def orientation(a: list[float], b: list[float], c: list[float]) -> float:
    return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])


def point_on_segment(point: list[float], start: list[float], end: list[float]) -> bool:
    cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1])
    if abs(cross) > 1e-9:
        return False
    return (
        min(start[0], end[0]) - 1e-9 <= point[0] <= max(start[0], end[0]) + 1e-9
        and min(start[1], end[1]) - 1e-9 <= point[1] <= max(start[1], end[1]) + 1e-9
    )


def segments_intersect(a1: list[float], a2: list[float], b1: list[float], b2: list[float]) -> bool:
    o1 = orientation(a1, a2, b1)
    o2 = orientation(a1, a2, b2)
    o3 = orientation(b1, b2, a1)
    o4 = orientation(b1, b2, a2)

    if ((o1 > 0 > o2) or (o1 < 0 < o2)) and ((o3 > 0 > o4) or (o3 < 0 < o4)):
        return True

    return (
        point_on_segment(b1, a1, a2)
        or point_on_segment(b2, a1, a2)
        or point_on_segment(a1, b1, b2)
        or point_on_segment(a2, b1, b2)
    )


def line_intersects_bounds(coordinates: list[list[float]], bounds: BBox) -> bool:
    if not coordinates:
        return False
    return bbox_intersects(get_bounds_from_coordinates(coordinates), bounds)


def line_intersects_polygon(coordinates: list[list[float]], polygon: list[list[float]]) -> bool:
    if len(coordinates) < 2 or len(polygon) < 3:
        return False

    polygon_ring = close_polygon(polygon)
    if not bbox_intersects(get_bounds_from_coordinates(coordinates), get_bounds_from_coordinates(polygon_ring)):
        return False

    if any(point_in_polygon(point, polygon_ring) for point in coordinates):
        return True

    for index in range(len(coordinates) - 1):
        segment_start = coordinates[index]
        segment_end = coordinates[index + 1]
        for poly_index in range(len(polygon_ring) - 1):
            if segments_intersect(segment_start, segment_end, polygon_ring[poly_index], polygon_ring[poly_index + 1]):
                return True

    return False


def polygon_intersects_polygon(left: list[list[float]], right: list[list[float]]) -> bool:
    left_ring = close_polygon(left)
    right_ring = close_polygon(right)

    if not bbox_intersects(get_bounds_from_coordinates(left_ring), get_bounds_from_coordinates(right_ring)):
        return False

    for index in range(len(left_ring) - 1):
        for other_index in range(len(right_ring) - 1):
            if segments_intersect(left_ring[index], left_ring[index + 1], right_ring[other_index], right_ring[other_index + 1]):
                return True

    return any(point_in_polygon(point, right_ring) for point in left_ring[:-1]) or any(
        point_in_polygon(point, left_ring) for point in right_ring[:-1]
    )


def matches_search(value: str, normalized_search: str) -> bool:
    return not normalized_search or normalized_search in value.upper()


def _strip_system_fields(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned = []
    for item in items:
        cleaned.append({key: value for key, value in item.items() if not key.startswith("_") and key not in {"type", "region", "source", "createdAt", "updatedAt", "eventDate"}})
    return cleaned


async def load_map_state(db: CosmosDB) -> dict[str, list[dict[str, Any]]]:
    assets_raw, zones_raw, connections_raw, tracks_raw, events_raw = await asyncio.gather(
        db.list_map_assets(),
        db.list_map_zones(),
        db.list_map_connections(),
        db.list_map_tracks(),
        db.list_map_events(),
    )

    assets = sorted(_strip_system_fields(assets_raw), key=lambda item: item.get("name", item.get("id", "")))
    zones = sorted(_strip_system_fields(zones_raw), key=lambda item: item.get("name", item.get("id", "")))
    connections = sorted(_strip_system_fields(connections_raw), key=lambda item: item.get("id", ""))
    tracks = sorted(_strip_system_fields(tracks_raw), key=lambda item: item.get("id", ""))
    events = sorted(_strip_system_fields(events_raw), key=lambda item: item.get("timestamp", ""), reverse=True)

    return {
        "assets": assets or MAP_ASSETS,
        "zones": zones or MAP_ZONES,
        "connections": connections or MAP_CONNECTIONS,
        "tracks": tracks or MAP_TRACKS,
        "events": events or MAP_EVENTS,
    }


def load_timeline(tracks: list[dict[str, Any]], events: list[dict[str, Any]]) -> list[str]:
    timeline = sorted(
        {
            point["timestamp"]
            for track in tracks
            for point in track.get("points", [])
            if point.get("timestamp")
        }
        | {event["timestamp"] for event in events if event.get("timestamp")}
    )
    return timeline or MAP_TIMELINE


def expand_connections(assets: list[dict[str, Any]], connections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    asset_lookup = {asset["id"]: asset for asset in assets}
    expanded = []
    for connection in connections:
        source = asset_lookup.get(connection["sourceId"])
        target = asset_lookup.get(connection["targetId"])
        if source and target:
            expanded.append({**connection, "coordinates": [source["location"], target["location"]]})
    return expanded


async def filter_map_features(*, db: CosmosDB, search: str, bounds: BBox | None = None, polygon: list[list[float]] | None = None) -> dict[str, Any]:
    normalized_search = search.strip().upper()
    state = await load_map_state(db)
    assets = state["assets"]
    zones = state["zones"]
    connections = expand_connections(assets, state["connections"])
    tracks = state["tracks"]
    events = state["events"]
    track_locations = {track["id"]: [point["location"] for point in track["points"]] for track in tracks}

    filtered_assets = [
        asset
        for asset in assets
        if matches_search(f"{asset['name']} {asset['description']} {' '.join(asset['tags'])}", normalized_search)
        and (
            point_in_polygon(asset["location"], polygon)
            if polygon
            else point_in_bounds(asset["location"], bounds)
            if bounds
            else True
        )
    ]

    filtered_zones = [
        zone
        for zone in zones
        if matches_search(f"{zone['name']} {zone['description']}", normalized_search)
        and (
            polygon_intersects_polygon(zone["coordinates"], polygon)
            if polygon
            else bbox_intersects(get_bounds_from_coordinates(zone["coordinates"]), bounds)
            if bounds
            else True
        )
    ]

    filtered_connections = [
        connection
        for connection in connections
        if matches_search(connection["description"], normalized_search)
        and (
            line_intersects_polygon(connection["coordinates"], polygon)
            if polygon
            else line_intersects_bounds(connection["coordinates"], bounds)
            if bounds
            else True
        )
    ]

    filtered_tracks = [
        track
        for track in tracks
        if matches_search(f"{track['label']} {track['assetId']}", normalized_search)
        and (
            line_intersects_polygon(track_locations[track["id"]], polygon)
            if polygon
            else line_intersects_bounds(track_locations[track["id"]], bounds)
            if bounds
            else True
        )
    ]

    filtered_events = [
        event
        for event in events
        if matches_search(f"{event['title']} {event['detail']}", normalized_search)
        and (
            point_in_polygon(event["location"], polygon)
            if polygon
            else point_in_bounds(event["location"], bounds)
            if bounds
            else True
        )
    ]

    return {
        "assets": filtered_assets,
        "zones": filtered_zones,
        "connections": filtered_connections,
        "tracks": filtered_tracks,
        "events": filtered_events,
        "timeline": load_timeline(filtered_tracks, filtered_events),
    }


async def get_object_detail(db: CosmosDB, object_type: str, object_id: str) -> dict[str, Any] | None:
    state = await load_map_state(db)
    assets = state["assets"]
    zones = state["zones"]
    connections = expand_connections(assets, state["connections"])
    tracks = state["tracks"]
    events = state["events"]

    result: dict[str, Any] = {
        "selection": {"type": object_type, "id": object_id},
        "asset": None,
        "zone": None,
        "connection": None,
        "track": None,
        "event": None,
        "relatedAssets": [],
        "relatedZones": [],
        "relatedConnections": [],
        "relatedTracks": [],
        "relatedEvents": [],
    }

    if object_type == "asset":
        asset = next((a for a in assets if a["id"] == object_id), None)
        if not asset:
            return None
        result["asset"] = asset
        result["relatedZones"] = [z for z in zones if z["id"] == asset.get("zoneId")]
        result["relatedTracks"] = [t for t in tracks if t["assetId"] == object_id]
        result["relatedEvents"] = [e for e in events if e.get("assetId") == object_id]
        
        # Connections where this asset is source or target
        asset_conns = [c for c in connections if c["sourceId"] == object_id or c["targetId"] == object_id]
        result["relatedConnections"] = asset_conns
        
        # Related assets via connections
        related_asset_ids = {c["sourceId"] for c in asset_conns} | {c["targetId"] for c in asset_conns}
        related_asset_ids.discard(object_id)
        result["relatedAssets"] = [a for a in assets if a["id"] in related_asset_ids]

    elif object_type == "zone":
        zone = next((z for z in zones if z["id"] == object_id), None)
        if not zone:
            return None
        result["zone"] = zone
        zone_ring = close_polygon(zone["coordinates"])
        
        # Assets in zone
        result["relatedAssets"] = [a for a in assets if point_in_polygon(a["location"], zone_ring) or a.get("zoneId") == object_id]
        # Events in zone
        result["relatedEvents"] = [e for e in events if point_in_polygon(e["location"], zone_ring) or e.get("zoneId") == object_id]
        # Tracks passing through zone
        result["relatedTracks"] = [t for t in tracks if any(point_in_polygon(p["location"], zone_ring) for p in t["points"])]

    elif object_type == "connection":
        conn = next((c for c in connections if c["id"] == object_id), None)
        if not conn:
            return None
        result["connection"] = conn
        result["relatedAssets"] = [a for a in assets if a["id"] in {conn["sourceId"], conn["targetId"]}]

    elif object_type == "event":
        event = next((e for e in events if e["id"] == object_id), None)
        if not event:
            return None
        result["event"] = event
        if event.get("assetId"):
            result["relatedAssets"] = [a for a in assets if a["id"] == event["assetId"]]
        if event.get("zoneId"):
            result["relatedZones"] = [z for z in zones if z["id"] == event["zoneId"]]

    elif object_type == "track":
        track = next((t for t in tracks if t["id"] == object_id), None)
        if not track:
            return None
        result["track"] = track
        if track.get("assetId"):
            result["relatedAssets"] = [a for a in assets if a["id"] == track["assetId"]]
            # Related events for this track's asset
            result["relatedEvents"] = [e for e in events if e.get("assetId") == track["assetId"]]

    else:
        return None

    return result

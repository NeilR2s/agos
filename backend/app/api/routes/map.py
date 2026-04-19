import httpx
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db.cosmos import CosmosDB, get_db
from app.services.map_service import BBox, close_polygon, filter_map_features

router = APIRouter()


class PolygonQueryRequest(BaseModel):
    polygon: list[list[float]] = Field(min_length=3)
    search: str = ""


@router.get("/features")
async def get_map_features(
    west: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    north: float = Query(...),
    search: str = Query(""),
    db: CosmosDB = Depends(get_db),
):
    return await filter_map_features(
        db=db,
        search=search,
        bounds=BBox(west=west, south=south, east=east, north=north),
    )


@router.post("/query")
async def query_map_features(body: PolygonQueryRequest, db: CosmosDB = Depends(get_db)):
    return await filter_map_features(db=db, search=body.search, polygon=close_polygon(body.polygon))


@router.get("/search")
async def search_places(query: str = Query(..., min_length=2), limit: int = Query(5, ge=1, le=10)):
    if not settings.GEOAPIFY_KEY:
        raise HTTPException(status_code=503, detail="Geoapify key is not configured")

    params = {
        "text": query,
        "format": "json",
        "filter": "countrycode:ph",
        "limit": limit,
        "apiKey": settings.GEOAPIFY_KEY,
    }
    url = f"https://api.geoapify.com/v1/geocode/search?{urlencode(params)}"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers={"Accept": "application/json"}, timeout=10)
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:  # pragma: no cover - network/provider failures
        import logging
        logging.getLogger(__name__).error(f"Geoapify lookup failed: {exc}")
        raise HTTPException(status_code=502, detail="Geocoding service unavailable") from exc

    features = payload.get("results", [])
    return {
        "results": [
            {
                "id": feature.get("place_id") or feature.get("result_type") or str(index),
                "label": feature.get("formatted") or feature.get("name") or query,
                "coordinates": [feature.get("lon"), feature.get("lat")],
                "country": feature.get("country"),
                "region": feature.get("state"),
            }
            for index, feature in enumerate(features)
            if feature.get("lon") is not None and feature.get("lat") is not None
        ]
    }

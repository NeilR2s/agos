from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    """Returns the status of the API and model loading."""
    from app.main import pipeline
    return {
        "status": "online" if pipeline is not None else "loading",
        "version": settings.VERSION,
        "model": settings.MODEL_PATH
    }

@router.get("/version")
async def version():
    """Returns the current API version."""
    return {"version": settings.VERSION}

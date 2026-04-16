from fastapi import APIRouter, Depends
from app.api.routes import system, forecast, trading
from app.core.security import get_current_user

api_router = APIRouter()
api_router.include_router(system.router, tags=["system"])
api_router.include_router(forecast.router, prefix="/forecast", tags=["forecast"], dependencies=[Depends(get_current_user)])
api_router.include_router(trading.router, prefix="/trading", tags=["trading"], dependencies=[Depends(get_current_user)])

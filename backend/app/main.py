import logging
from contextlib import asynccontextmanager

from azure.cosmos.aio import CosmosClient
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.limiter import limiter
from app.api.routes import agent, portfolio, market, data, map
from app.core.config import settings
from app.core.security import get_current_user
from app.db.cosmos import init_db, close_db
from app.db.agent_cosmos import init_agent_repository, close_agent_repository

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Creating shared async CosmosDB client …")
    cosmos_client = CosmosClient(settings.COSMOS_URI, settings.COSMOS_PRIMARY_KEY)

    db = await init_db(cosmos_client)
    agent_repo = await init_agent_repository(cosmos_client)

    # Expose on app.state so dependencies / middleware can reach them if needed
    app.state.db = db
    app.state.agent_repo = agent_repo
    app.state.cosmos_client = cosmos_client
    logger.info("CosmosDB async connection pool initialized")

    yield

    # --- Shutdown ---
    logger.info("Shutting down CosmosDB connection pool …")
    close_db()
    close_agent_repository()
    try:
        await cosmos_client.close()
    except Exception:
        logger.exception("Error closing CosmosClient")
    logger.info("CosmosDB connection pool closed")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API for managing PSEI portfolios and querying live market data.",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

dependencies = [Depends(get_current_user)]

app.include_router(portfolio.router, prefix=f"{settings.API_V1_STR}/portfolio", tags=["portfolio"], dependencies=dependencies)
app.include_router(market.router, prefix=f"{settings.API_V1_STR}/market", tags=["market"], dependencies=dependencies)
app.include_router(data.router, prefix=f"{settings.API_V1_STR}/data", tags=["data"], dependencies=dependencies)
app.include_router(map.router, prefix=f"{settings.API_V1_STR}/map", tags=["map"], dependencies=dependencies)
app.include_router(agent.router, prefix=f"{settings.API_V1_STR}/agent", tags=["agent"])

@app.get("/")
async def root():
    return {"message": "Welcome to AGOS Portfolio Manager API", "docs": "/docs"}

# uvicorn app.main:app --host 0.0.0.0 --port 8000

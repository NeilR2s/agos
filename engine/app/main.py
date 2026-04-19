from contextlib import asynccontextmanager

import httpx
import torch
from azure.cosmos.aio import CosmosClient as AsyncCosmosClient
from chronos import BaseChronosPipeline
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from app.core.limiter import limiter

from app.core.data_provider import DataProvider
from app.core.decision import DecisionEngine
from app.utils.logger import get_engine_logger
from app.core.config import settings
from app.api.api import api_router
from app.core.security import get_current_user

app_logger = get_engine_logger("agos.engine.api")

# Global pipeline and engine variables for access in routes
pipeline = None
decision_engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    global decision_engine
    
    model_path = settings.MODEL_PATH
    app_logger.info(f"Loading model from {model_path} on CPU...")

    # Force load onto CPU for Azure constraints
    pipeline = BaseChronosPipeline.from_pretrained(model_path, device_map="cpu")

    # Memory optimization: Apply PyTorch 8-bit dynamic quantization to linear layers
    app_logger.info("Applying 8-bit dynamic quantization to linear layers...")
    pipeline.model = torch.ao.quantization.quantize_dynamic(
        pipeline.model, {torch.nn.Linear}, dtype=torch.qint8
    )
    app_logger.info("Model loaded and quantized successfully.")

    # --- Create persistent connection pool ---
    cosmos_client: AsyncCosmosClient | None = None
    http_client: httpx.AsyncClient | None = None

    if settings.COSMOS_URI and settings.COSMOS_PRIMARY_KEY:
        cosmos_client = AsyncCosmosClient(settings.COSMOS_URI, credential=settings.COSMOS_PRIMARY_KEY)
        app_logger.info("Async CosmosDB client created")

    http_client = httpx.AsyncClient()
    app_logger.info("httpx AsyncClient created")

    data_provider = DataProvider(cosmos_client=cosmos_client, http_client=http_client)

    # Initialize the decision engine with the real model pipeline and injected data provider
    decision_engine = DecisionEngine(pipeline=pipeline, data_provider=data_provider)
    app_logger.info("DecisionEngine initialized successfully.")

    # Expose on app.state for potential route-level access
    app.state.data_provider = data_provider
    app.state.cosmos_client = cosmos_client
    app.state.http_client = http_client
    
    yield
    
    # --- Shutdown: close all persistent connections ---
    app_logger.info("Shutting down engine connection pool …")
    if data_provider:
        await data_provider.close()
        app_logger.info("DataProvider resources closed.")
    app_logger.info("Engine connection pool shutdown complete.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Unified API for time-series forecasting and hybrid rule/AI trading logic.",
    version=settings.VERSION,
    lifespan=lifespan,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Router with Prefix
# Auth is handled per-router inside api_router to allow public health endpoints
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {"message": "Welcome to AGOS Trading Engine API", "docs": "/docs"}

# uvicorn app.main:app --host 0.0.0.0 --port 5000

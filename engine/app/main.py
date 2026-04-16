from contextlib import asynccontextmanager

import torch
from chronos import BaseChronosPipeline
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.limiter import limiter

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

    # Initialize the decision engine with the real model pipeline
    decision_engine = DecisionEngine(pipeline=pipeline)
    app_logger.info("DecisionEngine initialized successfully with real model.")
    
    yield
    
    # Shutdown logic: Close data provider connections
    if decision_engine and decision_engine.data_provider:
        await decision_engine.data_provider.close()
        app_logger.info("Decision engine data provider closed.")

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

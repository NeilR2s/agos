from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
import logging
import os
import json

class Settings(BaseSettings):
    # API Settings
    PROJECT_NAME: str = "AGOS Trading Engine & Forecasting API"
    VERSION: str = "1.1.0"
    API_V1_STR: str = "/api/v1"
    PORT: int = 5000
    LOG_LEVEL: str = "INFO"
    
    # CORS
    CORS_ORIGINS: List[str] = []
    
    # Service Connections
    BACKEND_API_URL: str = "http://localhost:8000/api/v1"
    
    # Auth
    DEV_BYPASS_ENABLED: bool = False
    DEV_ADMIN_TOKEN: str | None = None
    FIREBASE_PROJECT_ID: str = "agos-auth"
    
    # Model
    MODEL_PATH: str = "./chronos_pse_finetuned/"
    
    # Cosmos DB
    COSMOS_URI: Optional[str] = None
    COSMOS_PRIMARY_KEY: Optional[str] = None
    COSMOS_DATABASE_ID: str = "agos-db"
    COSMOS_PSE_CONTAINER: str = "pse_stock_data"
    
    # Trading Parameters
    DEFAULT_CASH_BALANCE: float = 1000000.0
    MIN_AI_CONFIDENCE: float = 0.70
    MAX_PORTFOLIO_ALLOCATION_PER_TICKER: float = 0.20
    RSI_PERIOD: int = 14
    RSI_OVERBOUGHT: int = 70
    RSI_OVERSOLD: int = 30

    # Environment configuration
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        extra="ignore",
        env_file_encoding="utf-8"
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Handle comma-separated string for CORS_ORIGINS from env
        if isinstance(self.CORS_ORIGINS, str):
            try:
                self.CORS_ORIGINS = json.loads(self.CORS_ORIGINS)
            except json.JSONDecodeError:
                self.CORS_ORIGINS = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def log_level_int(self) -> int:
        return getattr(logging, self.LOG_LEVEL.upper(), logging.INFO)

# Global settings instance
settings = Settings()

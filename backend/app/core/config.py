import json
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # API Settings
    PROJECT_NAME: str = "AGOS Portfolio Manager"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8000
    
    # CORS
    # Can be a JSON list or a comma-separated string
    CORS_ORIGINS: List[str] = []

    # Service Connections
    ENGINE_API_URL: str = "http://localhost:5000"
    ENGINE_API_KEY: str = ""
    
    # Auth
    DEV_BYPASS_ENABLED: bool = False
    DEV_ADMIN_TOKEN: str | None = None
    FIREBASE_PROJECT_ID: str = "agos-auth"

    # Agent / LLM
    GEMINI_API_KEY: str = ""
    AGENT_MODEL: str = ""
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_TRACING: bool = False
    LANGGRAPH_AES_KEY: str = ""
    AGENT_ENABLE_ACTION_TOOLS: bool = False
    AGENT_HISTORY_WINDOW: int = 12

    # Cosmos DB
    COSMOS_URI: str
    COSMOS_PRIMARY_KEY: str
    COSMOS_DATABASE_ID: str
    COSMOS_PORTFOLIO_CONTAINER: str = ""
    COSMOS_MACRO_CONTAINER: str = ""
    COSMOS_NEWS_CONTAINER: str = ""
    COSMOS_PSE_CONTAINER: str = ""
    COSMOS_AGENT_THREADS_CONTAINER: str = ""
    COSMOS_AGENT_MESSAGES_CONTAINER: str = ""
    COSMOS_AGENT_RUNS_CONTAINER: str = ""
    COSMOS_AGENT_EVENTS_CONTAINER: str = ""
    COSMOS_AGENT_CHECKPOINTS_CONTAINER: str = ""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Handle comma-separated string for CORS_ORIGINS from env.
        if isinstance(self.CORS_ORIGINS, str):
            try:
                self.CORS_ORIGINS = json.loads(self.CORS_ORIGINS)
            except json.JSONDecodeError:
                self.CORS_ORIGINS = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]


settings = Settings()

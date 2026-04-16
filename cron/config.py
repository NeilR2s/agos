import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = ""
    PSE_MAX_CONCURRENCY: int = 20
    LOG_LEVEL: str = "INFO"

    # API Keys
    TAVILY_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # Cosmos DB
    COSMOS_URI: str = ""
    COSMOS_PRIMARY_KEY: str = ""
    COSMOS_DATABASE_ID: str = "agos-db"

    # Containers
    COSMOS_PSE_CONTAINER: str = "pse_stock_data"
    COSMOS_MACRO_CONTAINER: str = "macro_data"
    COSMOS_NEWS_CONTAINER: str = "news_sentiment_data"

    # PSA OpenStat sources
    PSA_GDP_SOURCE: str = ""
    PSA_INFLATION_SOURCE: str = ""
    PSA_LABOR_SOURCE: str = ""
    PSA_TRADE_SOURCE: str = ""

    # PSE EDGE sources
    PSE_DIRECTORY_SEARCH_SOURCE: str = ""
    PSE_DIRECTORY_FORM_SOURCE: str = ""
    PSE_STOCK_DATA_SOURCE: str = ""
    PSE_HOME_SOURCE: str = ""

    # BSP sources and namespaces
    BSP_KEY_RATES_SOURCE: str = ""
    BSP_EXCHANGE_RATES_SOURCE: str = ""
    BSP_NAMESPACE_ATOM: str = ""
    BSP_NAMESPACE_DATA: str = ""
    BSP_NAMESPACE_META: str = ""

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), ".env"),
        extra="ignore",
        env_file_encoding="utf-8"
    )

settings = Settings()

import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # LLM settings
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    AI_MODEL_VERSION: str = "gemini-2.5-flash"
    REASONING_EFFORT: str = "high"

    # Feature flags - set to False to skip a layer during testing
    ENABLE_LAYER1: bool = True
    ENABLE_LAYER2: bool = True
    ENABLE_LAYER3: bool = True
    ENABLE_LAYER4: bool = True

    # ANN settings
    ANOMALY_THRESHOLD_PERCENTILE: int = 95
    EPOCHS: int = 50
    BATCH_SIZE: int = 8

    # Trading engine settings
    STARTING_CAPITAL: float = 200000.0
    MAX_RISK_PERCENT: float = 0.10
    STOP_LOSS_PERCENT: float = 0.05

    # Data settings
    TICKER: str = "EPHE"
    DATA_PERIOD: str = "6mo"

    # File paths
    LAYER1_OUTPUT: str = "layer1_EPHE_data.csv"
    LAYER2_OUTPUT: str = "layer2_anomalies.csv"
    LAYER3_OUTPUT: str = "layer3_llm_analysis.csv"
    LAYER4_OUTPUT: str = "layer4_trade_log.csv"
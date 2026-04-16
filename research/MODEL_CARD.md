# Model Card: Chronos-2 PSE

## Model Details
- **Developed by:** AGOS Research
- **Model Type:** Univariate Time-Series Forecasting (Foundation Model Fine-tune)
- **Base Model:** `amazon/chronos-2`
- **Language(s):** Python (PyTorch)
- **License:** Apache 2.0 (inherited from base)

## Intended Use
- **Primary Use Case:** Forecasting stock price trajectories for equities listed on the Philippine Stock Exchange (PSE).
- **Intended Users:** Quantitative analysts and developers within the AGOS ecosystem.
- **Out of Scope:** This model is for research and paper trading simulations only. It should not be used for actual financial advice or live trading without further validation.

## Training Data
- **Dataset:** Historical price action data from the Philippine Stock Exchange (2010 - 2024).
- **Preprocessing:** 
  - Data converted to GluonTS JSONLines format.
  - History length: 512 tokens.
  - Prediction length: 24 tokens.
  - Augmentation: Random walk synthetic trajectories were used for initial pipeline validation.

## Performance Metrics
The model was evaluated against a naive random walk benchmark and the base Chronos-2 model.
- **Visual Validation:** Probabilistic bands (0.1, 0.5, 0.9 quantiles) successfully encompass historical volatility.
- **Quantization:** The model is served using INT8 dynamic quantization, reducing memory usage by ~70% with minimal loss in forecast accuracy.

## Training Configuration
- **Hardware:** Google Colab H100
- **Precision:** BF16 (Automatic Mixed Precision)
- **Optimizer:** AdamW
- **Learning Rate:** 1e-4 with Cosine Decay
- **Epochs:** Fine-tuned for 3-5 epochs on high-volatility PSE sectors.

## Limitations & Bias
- **Regional Bias:** Specifically fine-tuned for the PSE; performance on other markets (NYSE/NASDAQ) is not guaranteed.
- **Liquidity Issues:** Small-cap stocks with low liquidity may produce unreliable "gap-filled" forecasts.

## How to use
```python
from chronos import Chronos2Pipeline

pipeline = Chronos2Pipeline.from_pretrained(
    "./chronos-pse-finetuned/final", 
    device_map="cpu"
)
```

# engine

The `engine` service handles probabilistic time-series forecasting and trade evaluation.

## Entrypoint

Use `app/main.py` for the runtime service.

## Runtime Behavior

- **Model**: Loads the Chronos model from `engine/chronos_pse_finetuned/`.
- **Inference**: Controlled by the `INFERENCE_DEVICE` environment variable (defaults to `cpu`).
- **Optimization**: On CPU, 8-bit dynamic quantization is applied to linear layers to reduce memory usage.
- **Initialization**: Returns `503` for forecast and trading requests until the model and `DecisionEngine` are fully loaded.

## API Summary

- `POST /api/v1/forecast/`: Quantile-based price forecasting.
- `POST /api/v1/trading/evaluate`: Rule-gated trade decision making.
- `POST /api/v1/trading/override`: Manual trade authorization for audit trails.

## Decision Logic

1. Fetches historical prices from Cosmos DB or the backend.
2. Retrieves portfolio state from the backend.
3. Runs a Chronos forecast.
4. Applies confidence, RSI, and allocation gates defined in `app/core/config.py`.

## Configuration

- `BACKEND_API_URL`: Points to the backend service (default: `http://localhost:8000/api/v1`).
- `DEV_BYPASS_ENABLED`: Enables local development auth bypass.

## Verification

```bash
pytest tests
```

Tests cover model loading, safety rules, and data provider fallback.

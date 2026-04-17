# engine

`engine/` is the FastAPI service for forecast requests and rule-gated trade evaluation.

## Active entrypoint

- Use `app/main.py`.
- `app.py` still exists, but the current runtime described by routes and tests is under `app/main.py`.

## Runtime behavior

- Loads the model from `MODEL_PATH`, default `./chronos_pse_finetuned/`.
- Forces CPU loading with `BaseChronosPipeline.from_pretrained(..., device_map="cpu")`.
- Applies `torch.ao.quantization.quantize_dynamic` to linear layers.
- Initializes `DecisionEngine` after the model loads.
- Returns `503` from forecast and trading endpoints until initialization is complete.

## API surface

### Public routes

- `GET /api/v1/health`
- `GET /api/v1/version`

### Auth-protected routes

- `POST /api/v1/forecast/`
- `POST /api/v1/trading/evaluate`
- `POST /api/v1/trading/override`

## Request expectations

- Forecast requests need `history`, `prediction_length`, and optional `quantiles`. History must contain at least 10 points.
- Trade evaluation requests need `user_id`, `ticker`, and `lookback_days`. The current schema allows `lookback_days` from 14 to 365.
- Manual override requests need `user_id`, `ticker`, `action`, `quantity`, and `reason`.

## Decision flow

1. Fetch historical prices from Cosmos.
2. If Cosmos returns fewer than 14 usable points, call the backend chart endpoint.
3. Fetch portfolio state from the backend portfolio endpoint.
4. Run a 5-step Chronos forecast at quantiles `0.1`, `0.5`, and `0.9`.
5. Convert forecast output into `BUY`, `SELL`, or `HOLD` based on expected return and confidence.
6. Apply the confidence gate, RSI gate, and max-allocation gate before returning the final decision.

Current thresholds come from `app/core/config.py`.

- Minimum AI confidence: `0.70`
- Max allocation per ticker: `20%`
- RSI overbought: `70`
- RSI oversold: `30`

## Dependencies and env

- `BACKEND_API_URL` should point to `http://localhost:8000/api/v1`.
- Cosmos credentials are optional but enable direct historical lookups from `pse_stock_data`.
- Firebase dev bypass uses the same token pattern as the backend.
- The service expects the model artifact under `engine/chronos_pse_finetuned/`.

## Local run

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 5000
```

## Tests

```bash
pytest tests
```

## Current caveats

- Manual override returns an approved decision payload with audit fields. It does not execute orders.
- Tests cover loading, rules, and data-provider fallback, but not a full successful end-to-end evaluation path.

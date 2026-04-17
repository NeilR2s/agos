# research

`research/` is the offline Chronos workspace. It prepares PSE time-series data, fine-tunes `amazon/chronos-2`, and produces artifacts that can be moved into `engine/chronos_pse_finetuned/`.

## What is here

| File | Purpose |
| --- | --- |
| `split_data.py` | Build training and validation JSONL datasets from live PSE Edge price histories. |
| `preprocess_data.py` | Generate synthetic random-walk datasets for quick pipeline checks. |
| `train_chronos2.py` | Fine-tune `amazon/chronos-2` and save the exported artifact. |
| `visualize.py` | Plot a forecast against validation data and save `forecast_visualization.png`. |
| `pse_scraper.py` | Async PSE client used by `split_data.py`. |
| `train.ipynb` | Notebook workflow and experiment notes. |
| `MODEL_CARD.md` | Historical model notes. |
| `test_inference.py` | Older smoke-test script that no longer matches the current engine routes. |

## Real-data workflow

1. Build datasets from PSE Edge.

```bash
python split_data.py
```

This writes `data/train.jsonl` and `data/val.jsonl` from live chart histories.

2. Train the model.

```bash
python train_chronos2.py
```

The current script uses `amazon/chronos-2`, `context_length=512`, `prediction_length=24`, `batch_size=64`, and `max_steps=500`. The exported artifact is written to `chronos-pse-finetuned/final`.

3. Visualize one validation example.

```bash
python visualize.py
```

This reads `data/val.jsonl` and saves `forecast_visualization.png`.

4. Hand the model off to the runtime service.

Copy or sync the exported artifact into `engine/chronos_pse_finetuned/` for serving.

## Synthetic-data workflow

Use `preprocess_data.py` when you want to test the data and training path without hitting live PSE endpoints.

```bash
python preprocess_data.py
```

This generates synthetic `data/train.jsonl` and `data/val.jsonl`.

## Dependencies

`requirements.txt` is not a complete environment description right now. The scripts currently import at least:

- `torch`
- `transformers`
- `chronos-forecasting`
- `numpy`
- `pandas`
- `matplotlib`
- `requests`
- `beautifulsoup4`
- `lxml`
- `curl-cffi`

A workable local install from inside `research/` is:

```bash
pip install numpy pandas matplotlib requests beautifulsoup4 lxml curl-cffi torch transformers "chronos-forecasting>=2.0"
```

Add `jupyter` if you plan to use `train.ipynb`.

## Notes on current files

- `visualize.py` defaults to `amazon/chronos-2`. Point `model_path` at `./chronos-pse-finetuned/final` if you want to inspect the fine-tuned artifact.
- `test_inference.py` expects older `/health` and `/forecast` routes and is not the current serving check. Use the engine service and its `/api/v1/*` routes instead.
- This directory does not host the runtime API. Serving happens from `engine/`.
- `MODEL_CARD.md` is useful as historical context, but it should be checked against the current training data and runtime path before reuse outside the repo.
- Generated `data/` directories and model artifacts are local outputs, not committed runtime dependencies.

## Relationship to engine

- Training happens here.
- Inference happens in `engine/`.
- The serving model path in `engine/.env.example` is `./chronos_pse_finetuned/`.

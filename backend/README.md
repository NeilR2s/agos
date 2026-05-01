# backend

`backend/` is the FastAPI service that fronts portfolio state, live PSE market access, stored Cosmos data, and the AGOS agent runtime.

## What runs here

- Portfolio CRUD and holding enrichment.
- Live market, chart, filing, and parsed financial report access through `PSEService`.
- Read APIs over cron-written macro, news, and persisted PSE containers.
- Agent threads, runs, events, and SSE streaming.

## API groups

### Portfolio routes

- `GET /api/v1/portfolio/{user_id}`
- `GET /api/v1/portfolio/{user_id}/holdings/{ticker}`
- `POST /api/v1/portfolio/{user_id}/holdings`
- `PUT /api/v1/portfolio/{user_id}/holdings/{ticker}`
- `DELETE /api/v1/portfolio/{user_id}/holdings/{ticker}`
- `GET /api/v1/portfolio/{user_id}/cash`
- `PUT /api/v1/portfolio/{user_id}/cash`
- `DELETE /api/v1/portfolio/{user_id}/cash`

### Market routes

- `GET /api/v1/market/{ticker}`
- `GET /api/v1/market/{ticker}/chart`
- `GET /api/v1/market/{ticker}/financial-data`
- `GET /api/v1/market/{ticker}/financial-reports`

### Stored data routes

- `GET /api/v1/data/macro`
- `GET /api/v1/data/news`
- `GET /api/v1/data/pse`

### Agent routes

- `POST /api/v1/agent/threads`
- `GET /api/v1/agent/threads`
- `GET /api/v1/agent/threads/{thread_id}`
- `DELETE /api/v1/agent/threads/{thread_id}`
- `POST /api/v1/agent/threads/{thread_id}/generate-title`
- `GET /api/v1/agent/threads/{thread_id}/messages`
- `GET /api/v1/agent/threads/{thread_id}/runs`
- `POST /api/v1/agent/threads/{thread_id}/runs`
- `POST /api/v1/agent/threads/{thread_id}/runs/stream`
- `GET /api/v1/agent/threads/{thread_id}/runs/{run_id}`
- `GET /api/v1/agent/threads/{thread_id}/runs/{run_id}/events`
- Interrupt routes exist but currently return `501`.

## Auth and rate limiting

- `portfolio`, `market`, and `data` routers are mounted with `Depends(get_current_user)`.
- `agent` routes enforce auth per endpoint and use bearer tokens from `oauth2_scheme`.
- Firebase Admin verifies tokens. Dev bypass is available with `DEV_BYPASS_ENABLED` and `DEV_ADMIN_TOKEN`.
- The app uses SlowAPI with a default limit of `60/minute`.
- Agent run and stream endpoints are limited to `10/minute`.

## Storage

- Portfolio records live in the container configured by `COSMOS_PORTFOLIO_CONTAINER`. The example default is `portfolios`.
- Stored market data is read from `COSMOS_MACRO_CONTAINER`, `COSMOS_NEWS_CONTAINER`, and `COSMOS_PSE_CONTAINER`.
- Agent persistence uses `COSMOS_AGENT_THREADS_CONTAINER`, `COSMOS_AGENT_MESSAGES_CONTAINER`, `COSMOS_AGENT_RUNS_CONTAINER`, `COSMOS_AGENT_EVENTS_CONTAINER`, and `COSMOS_AGENT_CHECKPOINTS_CONTAINER`.

## Agent runtime

- Worker roles come from `app/services/agent/graph.py`.
- Research mode uses Research Lead, Portfolio Analyst, Web Investigator, and Risk Sentinel.
- Trading mode can add Execution Guard.
- Runs can call market, portfolio, research, and engine tools and stream events back to the frontend as SSE.

## Local run

- Populate `.env` from `.env.example` and set Cosmos, Firebase, and Gemini values.
- Run the service from inside `backend/`.

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Tests

```bash
pytest tests
```

Tests cover the agent graph, portfolio routes, live market access, and data ingestion from Cosmos.

## Caveats

- Portfolio routes require a path-to-token match for the `user_id` and return `403` on mismatches.
- The `agent` runtime uses Server-Sent Events (SSE) for real-time interaction logs.

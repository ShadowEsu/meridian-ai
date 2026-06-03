# Meridian

AI cost intelligence and spend management for enterprises. Meridian is a middleware/dashboard that observes traffic to LLM providers (OpenAI, Anthropic, Google, Azure), exposes per-team and per-key budgets, flags runaway agents, and routes prompts to the cheapest model that still meets the quality bar.

This repository contains the dashboard UI, an optional Express API server (auth, encrypted provider-key storage), and a Python ML service that powers the cost router.

## Repository layout

```
MeridianCode/
├── Meridian.html              # Single-page entrypoint (loads JSX in order)
├── package.json               # Node deps + scripts
├── .env.example               # Required env vars for the API server
├── src/
│   ├── app.jsx                # Root component, page routing, demo gate
│   ├── core/
│   │   ├── data.jsx           # Mock dataset on window.MERIDIAN
│   │   ├── icons.jsx          # SVG icon helper
│   │   ├── charts.jsx         # MiniBars, LineChart, AreaChart, PieChart
│   │   └── shell.jsx          # Sidebar, Header, GlobalSearch (⌘K)
│   ├── pages/
│   │   ├── overview.jsx       # KPI dashboard, daily savings, model mix
│   │   ├── feed.jsx           # Live request stream
│   │   ├── logs.jsx           # Request history table
│   │   ├── agents.jsx         # Agent monitor, runaway protection
│   │   ├── keys.jsx           # Virtual API key manager
│   │   ├── alerts.jsx         # Threshold notifications
│   │   ├── onboarding.jsx     # Provider connector wizard
│   │   ├── auth.jsx           # Sign-in/up (not loaded; gated for demo)
│   │   ├── intelligence.jsx   # ML waste metrics (deferred)
│   │   └── router.jsx         # Routing graph (deferred)
│   └── styles/
│       └── styles.css         # Design tokens, layout, components
├── server/
│   ├── index.js               # Static file server (default)
│   ├── index.with-api.js      # Express API: auth + provider keys + proxy
│   ├── auth-middleware.js     # JWT cookie session helpers
│   ├── crypto-secret.js       # AES-256-GCM for provider keys
│   └── store/json.js          # Flat-file JSON store (dev backend)
├── python/
│   └── router_service/        # FastAPI tier-routing model
│       ├── main.py            # POST /v1/route
│       ├── features.py        # Prompt feature extraction
│       └── train.py           # HistGradientBoostingClassifier trainer
├── schema/
│   └── meridian_ml_waste.sql  # Tables for api_calls, spend, training rows
└── docs/
    ├── GOAL.md                # Six-milestone product vision
    ├── BACKEND_PLAN.md        # Architecture + migration sequence
    ├── ML_PLAN.md             # Router product primer
    ├── DESIGN_STITCH.md       # Visual identity / design system
    └── screenshots/           # UI reference captures
```

## Quick start

### Static UI demo (no backend)

```
npm install
npm start
```

Serves the marketing homepage (`landing/index.html`) at `http://localhost:3000/`, and the dashboard SPA (`Meridian.html`) at `http://localhost:3000/app`. Dashboard numbers come from `src/core/data.jsx`. No login, no persistence.

### Run with the live backend

```bash
cp .env.example .env

# Generate secrets and paste into .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → ENCRYPTION_KEY

npm install
npm run doctor          # verify env + store paths are healthy
npm run seed:demo       # optional: pre-populate demo data
npm run start:api       # API server at http://localhost:5500
```

Then open the dashboard in a browser and run in the console:

```js
window.MERIDIAN_LIVE = true; location.reload();
```

The dashboard will now read from the live API instead of the static mock data.

**Demo login (after `npm run seed:demo`):** `demo@meridian.local` / `demo123demo`

#### Endpoint surface

| Domain         | Routes                                              |
|----------------|-----------------------------------------------------|
| Auth           | `POST /api/auth/signup`, `/login`, `/logout`, `/me` |
| Teams          | `GET/POST/PUT/DELETE /api/teams`                    |
| Provider keys  | `GET/POST/DELETE /api/provider-keys`                |
| Virtual keys   | `GET/POST/PUT/DELETE /api/virtual-keys`             |
| Agents         | `GET/POST /api/agents`, `POST /api/agents/:id/runs` |
| Alerts         | `GET/POST/PUT/DELETE /api/alerts`                   |
| Request log    | `POST /api/v1/requests` (ingest), `GET /api/requests` (query) |
| KPI            | `GET /api/kpi/overview`, `GET /api/kpi/feed`        |
| Audit log      | `GET /api/audit-log`                                |

Full schema and design rationale: [`docs/superpowers/plans/2026-05-07-backend-mvp.md`](docs/superpowers/plans/2026-05-07-backend-mvp.md).

### API server (auth + encrypted provider keys)

```
cp .env.example .env
# Set JWT_SECRET (random) and ENCRYPTION_KEY (64 hex chars)
npm run start:api
```

Serves the same UI plus REST endpoints under `/api/*`. Sessions are JWT in an httpOnly cookie. Provider keys are AES-256-GCM encrypted at rest in `data/meridian-store.json`.

### Python router service

```
cd python/router_service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8001
```

Returns a tier prediction (`cheap` / `mid` / `premium`) for a given prompt. Falls back to heuristic rules if no trained model is loaded.

## Environment

| Var              | Purpose                                                        |
|------------------|----------------------------------------------------------------|
| `PORT`           | Node server port (default `3000`, API server defaults `5500`)  |
| `JWT_SECRET`     | Signing secret for session cookies                             |
| `ENCRYPTION_KEY` | 64-hex-char (32-byte) key for provider-key encryption          |
| `NODE_ENV`       | `production` enables secure cookies, stricter CSP              |

## Architecture at a glance

- **Frontend:** React 18 served as raw JSX, transpiled in-browser by `@babel/standalone`. Intentionally bundler-free for the demo phase. Components are exposed on `window.*` and composed by `src/app.jsx`.
- **Backend (Node):** Express + Helmet + zod. JWT cookie auth. Provider keys encrypted with AES-256-GCM. Storage is pluggable via `MERIDIAN_STORE` (`json` today, `supabase` planned).
- **ML (Python):** FastAPI service that classifies a prompt into a cost tier. Training pipeline reads exported logs from the Node side; retraining cadence is weekly and user-triggered.

## Status

The static UI is feature-complete for the demo path (`npm start`). The backend MVP (M3) is shipped: all dashboard pages support a `MERIDIAN_LIVE` toggle that reads from the live API — auth, virtual keys, provider keys, agents, alerts, request log, KPI aggregation, and audit log are all backed by real storage. The ML service has feature extraction + a heuristic fallback but no production training loop.

Next: Supabase migration (M2), OTP auth (M1 remainder), ML cost router (M4), Vite + CSP hardening (M6).

See [docs/GOAL.md](docs/GOAL.md) for the product vision and [PLAN.md](PLAN.md) for the engineering roadmap.

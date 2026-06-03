# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Static UI demo (no backend, no auth)
npm start               # serves Meridian.html at http://localhost:3000

# API server (auth + encrypted keys + real storage)
npm run start:api       # Express at http://localhost:5500
npm run doctor          # validate .env + store paths before boot
npm run seed:demo       # populate demo user/data (demo@meridian.local / demo123demo)

# Tests
npm test                # vitest run (all backend tests)
npm run test:watch      # vitest watch mode

# Single test file
npx vitest run test/server/auth.test.js

# Python ML service
cd python/router_service
python -m venv .venv && source .venv/bin/activate  # (or .venv\Scripts\activate on Windows)
pip install -r requirements.txt
uvicorn main:app --port 8001

# Train the MLP router (after labeling data)
python train_mlp.py     # writes artifacts/router.joblib + artifacts/metrics.json
```

## Architecture

### How the pieces fit together

```
Browser → Meridian.html (no bundler; JSX transpiled in-browser by @babel/standalone)
             ↓
        src/core/api.jsx     window.MeridianAPI  (fetch wrapper, all /api/* calls)
        src/core/data.jsx    window.MERIDIAN      (mock dataset, demo mode only)
        src/app.jsx          useAuthGate()        (demo vs. live mode switch)
             ↓
        Express (server/index.with-api.js)
             ├── server/app.js         (createApp — mounts all routes, no static)
             ├── server/store/         (pluggable: json.js or supabase.js)
             ├── server/services/      (budget-engine, alert-engine, audit-log,
             │                          manual-router, mlp-router, model-catalog)
             └── server/routes/        (one file per domain)
                    ↓
             Python FastAPI  (python/router_service/main.py, port 8001)
             POST /v1/route → tier: cheap | mid | premium
```

### Demo vs. live mode

`Meridian.html` boots in **demo mode** by default — `window.MERIDIAN` (from `src/core/data.jsx`) feeds all pages; no auth, no backend needed. It auto-detects the API server by probing `/api/auth/config`; if that responds 200 it fires `meridian:live-detected` and `src/app.jsx`'s `useAuthGate` triggers sign-in flow. You can also force modes with `?live=1` / `?demo=1` query params or `localStorage`.

### Backend store

`MERIDIAN_STORE=json` (default) persists to `data/meridian-store.json`. `MERIDIAN_STORE=supabase` requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. The store interface is the same either way — all routes receive `ctx.store` injected in `createApp`. Production mode rejects the json store entirely.

### Routing pipeline

`server/routes/router.js` calls `server/services/mlp-router.js` (spawns `python/router_service/predict_cli.py` as a long-lived child process over JSON-line stdin/stdout) and falls back to `server/services/manual-router.js` (JS heuristics + 50-model CATALOG in `model-catalog.js`) when Python is unavailable.

### Auth

Sessions are JWT in an `httpOnly` cookie, signed by `JWT_SECRET`. `server/auth-middleware.js` parses and attaches `req.user`. Provider keys are AES-256-GCM encrypted at rest via `server/crypto-secret.js`. Supabase Google OAuth flows through `server/lib/supabase-auth.js`.

### Frontend component loading order

`Meridian.html` loads JSX files in explicit `<script type="text/babel">` order:
`data.jsx` → `api.jsx` → `supabase-client.jsx` → `icons.jsx` → `charts.jsx` → `shell.jsx` → pages (auth, overview, feed, logs, agents, keys, alerts, onboarding, stubs, models, ops-pages) → `app.jsx`.

Components are set on `window.*` by each file; `app.jsx` is the root that assembles them. This is intentional — no bundler for the demo phase.

### Dead code — intentionally not loaded

`src/pages/intelligence.jsx` and `src/pages/router.jsx` exist but are not referenced in `Meridian.html`. They're placeholders for M4 milestones. Don't delete them.

## Environment variables

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Session cookie signing (64 hex chars) |
| `ENCRYPTION_KEY` | AES-256-GCM for provider keys (64 hex chars) |
| `PORT` | Node server port (default 5500 for API, 3000 for static) |
| `NODE_ENV` | `production` enables secure cookies, blocks json store |
| `MERIDIAN_STORE` | `json` (default) or `supabase` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` / `SUPABASE_JWT_SECRET` | Required when `MERIDIAN_STORE=supabase` |
| `MLP_ROUTER_DISABLE=1` | Skip spawning the Python ML process |
| `MLP_ROUTER_MODEL` | Path to `router.joblib` artifact |
| `MERIDIAN_ROUTER_MODEL` | Same, used by the FastAPI service directly |

Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Test layout

Tests live in `test/server/` and `test/services/` and use Vitest + supertest. Each test file spins up the Express app against an in-memory JSON store — no external services required.

## Key milestones remaining

- **M1** — OTP auth, forgot-password flow
- **M2** — Supabase migration (schema in `schema/000_init.sql`; see `docs/SUPABASE_SETUP.md`)
- **M4** — ML cost router: add `scripts/export_training_data.js`, wire `MERIDIAN_ROUTER_MODEL` env, surface savings in `pages/overview.jsx`
- **M6** — Vite bundler for production (drop in-browser Babel transpile), tightened CSP

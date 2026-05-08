# Meridian — Engineering Plan

This is the working roadmap. Detailed designs live in `docs/`:
- [`docs/GOAL.md`](docs/GOAL.md) — product vision and non-negotiables
- [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md) — full backend architecture
- [`docs/ML_PLAN.md`](docs/ML_PLAN.md) — cost router product primer
- [`docs/DESIGN_STITCH.md`](docs/DESIGN_STITCH.md) — visual system

This file is the short version: where we are, what's next, and what's blocked.

## Where we are (snapshot)

| Surface           | State                                                                  |
|-------------------|------------------------------------------------------------------------|
| Static UI demo    | Complete. All 7 active pages render off `src/core/data.jsx`.           |
| API server        | MVP shipped (M3). 31 backend tests green. All pages support `MERIDIAN_LIVE` toggle. |
| JSON store        | Full CRUD for all domains. Not a production target.                    |
| Supabase          | Not started (M2).                                                      |
| Cost router (ML)  | FastAPI service with heuristic fallback. No trained model in repo.     |
| Training pipeline | Not started. CSV exporter from Node logs is missing.                   |
| Tests             | 31 Vitest/supertest backend tests. No frontend or ML tests yet.        |

## Audit findings (carried over from initial cleanup)

These are tracked here so we don't forget; resolve as work proceeds.

1. **Dead code in tree, intentionally not loaded** — `src/pages/auth.jsx`, `src/pages/intelligence.jsx`, `src/pages/router.jsx`. Keep until their milestones land; remove if those slip out of scope.
2. **`src/core/data.jsx` is a single 18 KB mock blob** — split into per-domain files (`models`, `teams`, `keys`, `agents`, `requests`, `alerts`, `waste`) when wiring real data, not before.
3. **`src/core/shell.jsx` mixes Sidebar + Header + GlobalSearch** — split when one of them grows non-trivially.
4. **No error boundary** — root render has no React error boundary; only the HTML-level boot error catches failures before mount.
5. **`/api/proxy/*` endpoints are stubs** — not safe to expose until provider request signing + per-key budget enforcement land.
6. **No CSP** — Helmet defaults are on, but a tightened `Content-Security-Policy` is deferred per `GOAL.md`.
7. **No responsive verification** — `clamp()` is used but layouts are not tested at 360 / 768 / 1024 / 1440 / 2560 widths.
8. **`server/json-store.js` has no migration story** — switching to Supabase will need a one-shot importer.

## Milestones

The product non-negotiable is that **`npm start` always works as a standalone UI demo**. Every milestone below has to ship without breaking that path.

### M1 — Real authentication

Email + password is already scaffolded; what's missing is email-code OTP and a real "settings → password" flow.

- [ ] Wire `src/pages/auth.jsx` into the root router (gated by a `MERIDIAN_REQUIRE_AUTH` flag so the demo path stays open).
- [ ] OTP send/verify endpoints (`POST /api/auth/otp/start`, `POST /api/auth/otp/verify`).
- [ ] Forgot-password flow.
- [ ] Audit-log every auth event.

Exit: a fresh user can sign up, log in via OTP, and rotate their password.

### M2 — Persistent storage

Move off the flat-file `json-store.js` for anything beyond local dev.

- [ ] `MERIDIAN_STORE=json|supabase` env switch with two adapters behind one interface.
- [ ] Supabase schema for users, provider_keys, audit_log.
- [ ] Importer: `node scripts/import_json_to_supabase.js`.
- [ ] Doctor script: `node scripts/doctor.js` validates env + schema before boot.

Exit: API server runs against Supabase end-to-end; demo path still uses neither.

### M3 — Operational backend

The pages currently read from `window.MERIDIAN.*`. Replace with real endpoints, one domain at a time.

- [x] `agents` — CRUD + `POST /api/agents/:id/runs` to record a run.
- [x] `requests` — append-only log table; pagination + filter endpoints to back `pages/logs.jsx`.
- [x] `budgets` — per-key + per-team thresholds; alert state machine.
- [x] `alerts` — channel registration (email first), threshold matching, dispatch.
- [x] `virtualKeys` — CRUD with bcrypt-hashed secrets; `X-Meridian-Key` ingest auth.
- [x] `teams` — CRUD; per-team budget rollup in KPI aggregation.
- [x] `audit log` — append-only event log; `GET /api/audit-log` for the dashboard.
- [x] `KPI aggregation` — `GET /api/kpi/overview` and `GET /api/kpi/feed` over the request log.

Each domain ships behind a `MERIDIAN_LIVE_<DOMAIN>` flag; the demo data path is the fallback.

Exit: a real workload writes to `requests` and the Logs page renders it. **DONE — 2026-05-08.**

### M4 — Cost router (ML)

`python/router_service/` has features + a heuristic. The training side is the hole.

- [ ] `scripts/export_training_data.js` — pull labeled rows out of the Node store into CSV at `python/router_service/data/training.csv`.
- [ ] Finalize `python/router_service/train.py` — write `model.joblib` + `metrics.json`.
- [ ] Wire `MERIDIAN_ROUTER_MODEL` into `main.py` to load the artifact at startup.
- [ ] Node → Python integration: `server/router-client.js` calls the FastAPI service and falls back to "use the requested model" on error.
- [ ] Weekly retrain cadence — user-triggered button in `pages/intelligence.jsx`, never automatic.

Exit: a request comes in, the Node server asks the Python service for a tier, and routes accordingly. Savings are visible in `pages/overview.jsx`.

### M5 — Responsive + design polish

- [ ] Manual QA pass at 360 / 768 / 1024 / 1440 / 2560 widths for every active page.
- [ ] Sidebar collapse with `localStorage` persistence.
- [ ] Real error boundary at the root with a recovery action.
- [ ] Replace any `console.error` with structured client-side logging that the API server can ingest.

### M6 — Security hardening

- [ ] Tightened CSP (no `unsafe-inline`, `unsafe-eval` only in dev because of Babel standalone — production must drop in-browser transpile).
- [ ] Move to a real bundler (Vite) for production builds, keeping the no-bundler demo path for local dev only.
- [ ] Rotate `ENCRYPTION_KEY` migration path.
- [ ] Penetration test pass on auth + provider-key endpoints.

## Test scaffolding (cuts across milestones)

- [ ] `vitest` for `server/*` (auth, crypto, store).
- [ ] `pytest` for `python/router_service/*` (features, train, main).
- [ ] Playwright smoke test that boots `Meridian.html`, signs in, and visits each page.

## Decision log

Append-only. Each entry: date, decision, why.

- **2026-05-07** — Reorganized flat root into `src/{core,pages,styles}` and moved planning docs to `docs/`. Why: 16 JSX files at root made onboarding noisy and obscured the server/python/schema separation.
- **2026-05-07** — Kept `Meridian.html` as the entrypoint name (rather than `index.html`). Why: `server/index.js` hardcodes the filename and renaming touches three files for no real gain right now.
- **2026-05-07** — Dropped the `page-` prefix on files inside `src/pages/`. Why: redundant with the folder name; component names (`PageOverview` etc.) keep the prefix where it actually matters.
- **2026-05-08** — Shipped backend MVP: per-request log, virtual keys with bcrypt-hashed secrets, budget engine, alert engine, agents/runs, KPI aggregation. Frontend reads from MeridianAPI when MERIDIAN_LIVE=true; demo path unchanged.

## Known cuts (won't do unless asked)

- No automatic ML retraining (per `GOAL.md` non-negotiables).
- No multi-tenant org model in M1–M3. One user = one workspace until M4 forces the question.
- No Stripe / billing surface. Out of scope for the dashboard product.

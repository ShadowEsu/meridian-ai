# Meridian AI

**AI cost intelligence for LLM fleets** — see spend by team, cap budgets per key, catch runaway agents, and route prompts to cheaper models when quality holds.

| | |
|---|---|
| **Repository** | [github.com/ShadowEsu/meridian-ai](https://github.com/ShadowEsu/meridian-ai) |
| **Live app** | [meridian20.onrender.com](https://meridian20.onrender.com/) |
| **Author** | [Preston Jay Susanto](https://github.com/ShadowEsu) · prestonjaysusanto@gmail.com |

> **Go live:** **[docs/WEB_PUBLISH.md](docs/WEB_PUBLISH.md)** (Supabase + Google + Render) · **Launch page plan:** **[docs/MERIDIAN_AI_LAUNCH_PLAN.md](docs/MERIDIAN_AI_LAUNCH_PLAN.md)**

---

## What it does

- **Dashboard** — Overview, live feed, request logs, agent monitor, virtual keys, alerts
- **Auth** — Email/password + Google sign-in (via Supabase)
- **Storage** — Supabase Postgres in production, JSON file for local dev
- **Ingest API** — Apps report LLM usage with `X-Meridian-Key` headers
- **ML router** — Python service classifies prompts into `cheap` / `mid` / `premium` tiers (train it yourself)

---

## Architecture & diagrams

Copy this entire section (or the whole README) into docs, Notion, or slides. **Image files** live in [`docs/diagrams/`](docs/diagrams/) — keep that folder next to the README so `![...](docs/diagrams/...)` links work. On GitHub, Mermaid blocks below render as interactive diagrams automatically.

### Diagram gallery (SVG images)

| # | Diagram | File |
|---|---------|------|
| 1 | System overview | [`01-system-overview.svg`](docs/diagrams/01-system-overview.svg) |
| 2 | Frontend boot | [`02-frontend-boot.svg`](docs/diagrams/02-frontend-boot.svg) |
| 3 | Demo vs live mode | [`03-demo-vs-live.svg`](docs/diagrams/03-demo-vs-live.svg) |
| 4 | Auth workflow | [`04-auth-workflow.svg`](docs/diagrams/04-auth-workflow.svg) |
| 5 | Request ingest | [`05-request-ingest.svg`](docs/diagrams/05-request-ingest.svg) |
| 6 | ML cost router | [`06-ml-router.svg`](docs/diagrams/06-ml-router.svg) |
| 7 | Database ERD | [`07-database-erd.svg`](docs/diagrams/07-database-erd.svg) |
| 8 | Production deploy | [`08-deploy-workflow.svg`](docs/diagrams/08-deploy-workflow.svg) |
| 9 | Repo map | [`09-repo-structure.svg`](docs/diagrams/09-repo-structure.svg) |

#### 1 — System overview

![Meridian system overview](docs/diagrams/01-system-overview.svg)

#### 2 — Frontend boot sequence

![Frontend boot sequence](docs/diagrams/02-frontend-boot.svg)

#### 3 — Demo vs live mode

![Demo vs live mode](docs/diagrams/03-demo-vs-live.svg)

#### 4 — Authentication

![Authentication workflow](docs/diagrams/04-auth-workflow.svg)

#### 5 — Request ingest (your apps → dashboard)

![Request ingest pipeline](docs/diagrams/05-request-ingest.svg)

#### 6 — ML cost router

![ML cost router pipeline](docs/diagrams/06-ml-router.svg)

#### 7 — Database schema

![Database ERD](docs/diagrams/07-database-erd.svg)

#### 8 — Production deploy

![Production deploy workflow](docs/diagrams/08-deploy-workflow.svg)

#### 9 — Repository map

![Repository structure](docs/diagrams/09-repo-structure.svg)

---

### Mermaid diagrams (GitHub / GitLab render these as graphics)

#### End-to-end system flow

```mermaid
flowchart TB
  subgraph Client["Browser"]
    HTML["Meridian.html"]
    BOOT["meridian-boot.js"]
    APP["app.jsx + pages"]
    HTML --> BOOT --> APP
  end

  subgraph API["Express :5500"]
    CREATE["createApp()"]
    AUTH["routes/auth"]
    INGEST["POST /api/v1/requests"]
    KPI["routes/kpi"]
    ROUTER["routes/router"]
    CREATE --> AUTH
    CREATE --> INGEST
    CREATE --> KPI
    CREATE --> ROUTER
  end

  subgraph Data["Storage"]
    JSON["json store\ndata/meridian-store.json"]
    SB["Supabase Postgres\nschema/000_init.sql"]
  end

  subgraph ML["Optional ML"]
    CLI["predict_cli.py"]
    FAST["FastAPI :8001"]
  end

  APP -->|"MeridianAPI /api/*"| CREATE
  CREATE --> JSON
  CREATE --> SB
  ROUTER --> CLI
  ROUTER -.-> FAST

  subgraph Apps["Your applications"]
    APP2["LLM app / agent"]
  end
  APP2 -->|"X-Meridian-Key"| INGEST
```

#### Demo vs live decision

```mermaid
flowchart LR
  START([Page load]) --> Q1{?live=1 or\nlocalStorage live?}
  Q1 -->|yes| LIVE[Live mode\nMeridianAPI + auth]
  Q1 -->|no| Q2{?demo=1 or\nlocalStorage demo?}
  Q2 -->|yes| DEMO[Demo mode\nwindow.MERIDIAN mock]
  Q2 -->|no| PROBE[fetch /api/auth/config]
  PROBE -->|200 OK| LIVE
  PROBE -->|fail| DEMO
  LIVE --> GATE[useAuthGate sign-in]
  DEMO --> UI[Dashboard with sample data]
```

#### Auth sequence

```mermaid
sequenceDiagram
  actor U as User
  participant UI as auth.jsx
  participant API as routes/auth.js
  participant ST as store
  participant SB as Supabase OAuth

  alt Email password
    U->>UI: register / login
    UI->>API: POST /api/auth/login
    API->>ST: verify bcrypt hash
    API-->>UI: Set-Cookie JWT httpOnly
  else Google
    U->>SB: OAuth redirect
    SB->>UI: callback
    UI->>API: POST /api/auth/supabase-callback
    API->>ST: upsert user + link supabase_user_id
    API-->>UI: Set-Cookie JWT httpOnly
  end
  Note over API: readUser() on every /api request
```

#### Request ingest sequence

```mermaid
sequenceDiagram
  participant App as Your app
  participant API as requests.js
  participant VK as virtual-key-auth
  participant BE as budget-engine
  participant ST as store
  participant AL as alert-engine

  App->>API: POST /api/v1/requests + X-Meridian-Key
  API->>VK: validate mk_ key
  VK->>ST: lookup virtual key
  API->>BE: classify spend severity
  API->>ST: requests.add + recordSpend
  API->>AL: onRequest (thresholds)
  API-->>App: 201 { id, costUsd, severity }
```

#### ML router decision

```mermaid
flowchart TD
  P[Prompt + constraints] --> PREVIEW[POST /api/router/preview]
  PREVIEW --> MLP{mlp-router ready?}
  MLP -->|yes| PY[predict_cli.py\ntier + confidence]
  MLP -->|no| HEUR[manual-router.js\nheuristics only]
  PY --> PICK[pickModel + CATALOG]
  HEUR --> PICK
  PICK --> OUT[Model recommendation\ncheap / mid / premium]
```

#### Database relationships

```mermaid
erDiagram
  meridian_users ||--o{ meridian_provider_keys : has
  meridian_users ||--o{ meridian_teams : owns
  meridian_users ||--o{ meridian_virtual_keys : issues
  meridian_users ||--o{ meridian_agents : monitors
  meridian_users ||--o{ meridian_alerts : configures
  meridian_users ||--o{ meridian_requests : ingests
  meridian_teams ||--o{ meridian_virtual_keys : scopes
  meridian_provider_keys ||--o{ meridian_virtual_keys : routes
  meridian_virtual_keys ||--o{ meridian_requests : attributes
  meridian_teams ||--o{ meridian_requests : attributes
  meridian_agents ||--o{ meridian_agent_runs : runs
  meridian_agents ||--o{ meridian_requests : optional
```

#### Local development workflows

```mermaid
flowchart TB
  subgraph Demo["UI only (no backend)"]
    D1["npm install"] --> D2["npm start :3000"]
    D2 --> D3["Open localhost:3000\nmock data"]
  end

  subgraph Live["Full stack local"]
    L1["cp .env.example .env"] --> L2["npm run start:api :5500"]
    L2 --> L3["?live=1 or auto-detect"]
    L3 --> L4["npm run seed:demo optional"]
  end

  subgraph ML["Train router optional"]
    M1["cd python/router_service"] --> M2["pip install -r requirements.txt"]
    M2 --> M3["python train_mlp.py"]
    M3 --> M4["artifacts/router.joblib"]
  end

  subgraph CI["Quality"]
    T1["npm test vitest"] --> T2["npm run doctor"]
  end
```

#### Production deploy (Render + Supabase)

```mermaid
flowchart LR
  GH[GitHub repo] --> R[Render Web Service\nnpm run start:api]
  SQL[schema/000_init.sql] --> SB[(Supabase Postgres)]
  ENV[Secrets: JWT ENCRYPTION SUPABASE_*] --> R
  R --> SB
  R --> UI[Meridian.html served at /]
  APPS[Customer apps] -->|X-Meridian-Key| R
```

---

### Express route map

| Area | Endpoints |
|------|-----------|
| **Auth** | `GET /api/auth/config`, `POST /api/auth/register`, `login`, `supabase-callback`, `logout`, `GET /api/auth/me` |
| **Ingest** | `POST /api/v1/requests` (virtual key), `GET /api/requests` (session) |
| **KPI** | `GET /api/kpi/overview`, `GET /api/kpi/feed` |
| **Keys** | `GET/POST/DELETE /api/provider-keys`, `GET/POST/PUT/DELETE /api/virtual-keys` |
| **Teams** | `GET/POST/PUT/DELETE /api/teams` |
| **Agents** | `GET/POST/PUT/DELETE /api/agents`, runs under `/api/agents/:id/runs` |
| **Alerts** | `GET/POST/PUT/DELETE /api/alerts` |
| **Router** | `POST /api/router/preview`, `GET /api/router/mlp/status`, `GET /api/router/catalog` |
| **Other** | `GET /api/models`, audit log, proxy routes |

---

## Quick start (local demo)

No backend — sample data only:

```bash
npm install
npm start
```

- Dashboard (demo): `http://localhost:3000/`
- Marketing preview: `http://localhost:3000/home`

Sample data from `src/core/data.jsx` — no login, no persistence.

---

## Quick start (live backend)

```bash
cp .env.example .env
# Fill JWT_SECRET, ENCRYPTION_KEY, and Supabase vars (see below)

npm install
npm run start:api
```

Open **`http://localhost:5500/`** (production mirror: **`https://meridian20.onrender.com/`**)

Optional demo data:

```bash
npm run seed:demo
# Login: demo@meridian.local / demo123demo
```

---

## Deploy to Render (production)

This repo includes a [`render.yaml`](render.yaml) blueprint.

### 1. Clone this repo

```bash
git clone https://github.com/ShadowEsu/meridian-ai.git
cd meridian-ai
```

Connect **`ShadowEsu/meridian-ai`** (branch `main`) in [Render](https://dashboard.render.com/).

### 2. Supabase setup

1. Create a [Supabase](https://supabase.com) project
2. Run [`schema/000_init.sql`](schema/000_init.sql) in the SQL editor
3. Enable **Google** under Authentication → Providers
4. Set **Site URL** and **Redirect URLs** to your Render URL (see [docs/WEB_PUBLISH.md](docs/WEB_PUBLISH.md))

### 3. Render environment variables

In Render → **Environment**, set:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `MERIDIAN_STORE` | `supabase` |
| `JWT_SECRET` | 64-char hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `ENCRYPTION_KEY` | another 64-char hex |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → **publishable** key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → **secret** key (`sb_secret_…`, server only) |
| `SUPABASE_JWT_SECRET` | optional — only for legacy HS256; ECC (P-256) projects can omit |

`PORT` is set automatically by Render.

### 4. Deploy

- **New → Blueprint** → connect this repo → branch `main`
- Or **Web Service**: build `npm install`, start `npm run start:api`
- Health check: `/api/auth/config`

Full walkthrough: **[docs/WEB_PUBLISH.md](docs/WEB_PUBLISH.md)**

---

## Wire your apps

Each app gets a **virtual key** (`mk_…`). After every LLM call:

```http
POST https://meridian20.onrender.com/api/v1/requests
X-Meridian-Key: mk_your_secret_here
Content-Type: application/json

{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "promptTokens": 100,
  "completionTokens": 50,
  "latencyMs": 200,
  "status": "ok"
}
```

Traffic shows up on Overview, Live Feed, and Request Logs.

---

## Project structure

```
meridian-ai/
├── Meridian.html              # SPA entrypoint
├── src/meridian-boot.js       # Sequential JSX loader
├── src/core/                  # api, data, shell, charts…
├── src/pages/                 # Dashboard pages
├── server/                    # Express API (app.js, routes/, services/, store/)
├── python/router_service/     # ML cost router
├── schema/000_init.sql        # Supabase schema
├── docs/diagrams/             # Architecture SVGs (see gallery above)
├── test/                      # Vitest + supertest
└── render.yaml                # Render deploy blueprint
```

Full visual map: [`docs/diagrams/09-repo-structure.svg`](docs/diagrams/09-repo-structure.svg)

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Static demo (port 3000) |
| `npm run start:api` | API + dashboard (port 5500) |
| `npm run seed:demo` | Populate demo user + 500 requests |
| `npm run doctor` | Validate env + store |
| `npm test` | Backend tests (Vitest) |

---

## Docs

- **Diagrams** — [`docs/diagrams/`](docs/diagrams/) (9 SVG architecture images; gallery in this README)
- [WEB_PUBLISH.md](docs/WEB_PUBLISH.md) — Google OAuth + Render + Supabase checklist
- [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) — Google sign-in setup
- [DEPLOY.md](docs/DEPLOY.md) — Production notes
- [BACKEND_PLAN.md](docs/BACKEND_PLAN.md) — Backend milestone plan
- [GOAL.md](docs/GOAL.md) — Product vision
- [CLAUDE.md](CLAUDE.md) — Agent/dev quick reference

---

## License

© 2026 Preston Jay Susanto. Source is public for portfolio and deployment; reuse beyond fork/deploy requires permission.

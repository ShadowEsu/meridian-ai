# Meridian 2.0

**AI cost intelligence for LLM fleets** — see spend by team, cap budgets per key, catch runaway agents, and route prompts to cheaper models when quality holds.

Built by [Preston Susanto](https://github.com/PrestonSusanto).

---

## What it does

- **Dashboard** — Overview, live feed, request logs, agent monitor, virtual keys, alerts
- **Auth** — Email/password + Google sign-in (via Supabase)
- **Storage** — Supabase Postgres in production, JSON file for local dev
- **Ingest API** — Apps report LLM usage with `X-Meridian-Key` headers
- **ML router** — Python service classifies prompts into `cheap` / `mid` / `premium` tiers (train it yourself)

---

## Quick start (local demo)

No backend — sample data only:

```bash
npm install
npm start
```

- Marketing homepage: `http://localhost:3000/`
- Dashboard (demo): `http://localhost:3000/app`

Sample data from `src/core/data.jsx` — no login, no persistence.

---

## Quick start (live backend)

```bash
cp .env.example .env
# Fill JWT_SECRET, ENCRYPTION_KEY, and Supabase vars (see below)

npm install
npm run start:api
```

Open **`http://localhost:5500/app`** (add `?live=1` if auto-detect does not flip to live)

Optional demo data:

```bash
npm run seed:demo
# Login: demo@meridian.local / demo123demo
```

---

## Deploy to Render (production)

This repo includes a [`render.yaml`](render.yaml) blueprint.

### 1. Fork or clone this repo

Use **your** GitHub account — connect this repo in [Render](https://dashboard.render.com/).

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
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (server only) |
| `SUPABASE_JWT_SECRET` | same page → JWT secret |

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
POST https://YOUR-APP.onrender.com/api/v1/requests
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
Meridian2.0/
├── Meridian.html          # SPA entrypoint
├── render.yaml            # Render deploy blueprint
├── src/                   # React dashboard (in-browser JSX)
├── server/                # Express API
├── python/router_service/ # ML cost router
├── schema/000_init.sql    # Supabase schema
└── docs/                  # Plans + deploy guides
```

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

- [WEB_PUBLISH.md](docs/WEB_PUBLISH.md) — Google OAuth + Render + Supabase checklist
- [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) — Google sign-in setup
- [DEPLOY.md](docs/DEPLOY.md) — Production notes
- [GOAL.md](docs/GOAL.md) — Product vision

---

## License

Private / all rights reserved unless otherwise noted.

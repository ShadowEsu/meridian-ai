# Meridian — production deploy

End-to-end checklist. Time to first prod deploy: ~30 minutes if you already have a Supabase project provisioned.

---

## TL;DR

```bash
npm install                                          # gets @supabase/supabase-js
# Apply schema once via Supabase SQL editor:
#   open schema/000_init.sql, paste into editor, run
# Fill .env (see below)
NODE_ENV=production MERIDIAN_STORE=supabase npm run start:api
```

The server boots in production-mode and refuses to start if any required env var is missing. `MERIDIAN_STORE=json` is rejected when `NODE_ENV=production` — JSON store is single-process only and corrupts under concurrent writes.

---

## 1. Required env (production)

Copy `.env.example` → `.env` and fill these:

| Var | Where to get it | Purpose |
|---|---|---|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Signs session cookies. Min 32 chars. |
| `ENCRYPTION_KEY` | run that command again | AES-256-GCM key for encrypted provider API keys. |
| `MERIDIAN_STORE` | literal `supabase` | Storage backend. |
| `SUPABASE_URL` | Supabase Project Settings → API | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | same page → "anon public" | Sent to browser for OAuth. |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → "service_role" | **Server only — never expose to browser.** |
| `SUPABASE_JWT_SECRET` | same page → "JWT secret" | Validates Supabase-signed JWTs at the API. |
| `NODE_ENV` | `production` | Enables strict secret validation, trusted proxy, etc. |
| `PORT` | `5500` (default) or whatever your platform sets | Bind port. |

`PORT` is read from the platform on Render / Railway / Fly. Don't hardcode it in the platform's env.

---

## 2. Apply the schema

The schema is one file: `schema/000_init.sql`. It creates 9 `meridian_*` tables, indexes them on `(user_id, timestamp desc)` for the hot paths, and enables RLS as defense-in-depth.

**Option A — Supabase dashboard (easiest):**
1. Open your project at <https://supabase.com/dashboard>
2. SQL Editor → New query
3. Paste the contents of `schema/000_init.sql`
4. Run

**Option B — `supabase` CLI:**
```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push --file schema/000_init.sql
```

To verify, in SQL editor: `select tablename from pg_tables where tablename like 'meridian_%';` — should list 9 rows.

---

## 3. Boot

```bash
npm install
NODE_ENV=production MERIDIAN_STORE=supabase npm run start:api
```

Healthcheck: `curl http://localhost:5500/api/auth/config` — should return `{ "googleEnabled": true }` (or `false` if you skipped OAuth).

If the server exits on boot, you'll get one of these messages — all self-explanatory:
- `Set JWT_SECRET and ENCRYPTION_KEY in .env` → run the secret-generation commands above
- `MERIDIAN_STORE=supabase requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY` → fill them
- `NODE_ENV=production requires MERIDIAN_STORE=supabase` → set it; do not run JSON store in prod

---

## 4. Deploy targets

The server is plain Express on Node 18+. Anything that can run a Node process works.

| Platform | Notes |
|---|---|
| **Render** | "Web Service" → connect repo → build `npm install` → start `npm run start:api` → set env in dashboard |
| **Railway** | same shape; auto-detects Node |
| **Fly.io** | needs a `Dockerfile` (FROM node:18-alpine, COPY, RUN npm install, CMD npm run start:api) and `fly.toml` with `internal_port = 5500` |
| **Vercel** | not recommended — server is long-lived (`setInterval` loops in alert engine), serverless functions will mis-fire |
| **Self-host** | systemd unit + nginx in front for TLS works fine |

Either way: env vars in the platform dashboard, not committed.

---

## 5. Post-deploy smoke

```bash
# Anonymous endpoints
curl https://your-domain/api/auth/config              # {"googleEnabled": ...}
curl https://your-domain/api/models                   # 9-model catalogue

# Auth round-trip
curl https://your-domain/api/auth/me                  # 401 expected (no cookie)

# Open the dashboard
open https://your-domain/                             # should render Meridian.html
```

If the dashboard loads and `/api/models` returns the pricing table, the deploy is healthy.

---

## 6. Operational notes

- **Backups**: Supabase Pro plan auto-backs-up daily. Free tier doesn't — you're responsible. Schedule `pg_dump` to S3 or skip if you're OK losing data.
- **MTD reset**: `virtual_keys.spent_mtd_usd` is reset by `store.virtualKeys.resetMtd()`. Wire a monthly cron to call it (or a Postgres scheduled function).
- **Migrations beyond v1**: add `schema/001_*.sql` etc. and apply in order. The store interface stays stable; if you alter shape, update the `MAP` mapper in `server/store/supabase.js`.
- **Switching back to JSON for local dev**: `MERIDIAN_STORE=json npm run start:api`. Production refuses this — feature, not bug.

---

## 7. Known gaps (file follow-up issues)

- **Routing rules engine**: UI shows the rules but the proxy route (`server/routes/proxy.js`) doesn't yet evaluate them. Treat current behavior as "default routing only".
- **Cache**: stats on the page are static. Cache implementation is a TODO.
- **Billing**: invoices are hardcoded; Stripe integration is a TODO.
- **Integrations**: connection states are static. Webhook delivery is a TODO.
- **Settings**: persists to `localStorage` only; no server-side prefs table yet.

These pages all *look* live so the UX flow is testable; flagging them so nobody assumes they actually mutate state.

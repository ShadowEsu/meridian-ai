# Publish Meridian AI to the Web

Complete checklist for **Preston Jay Susanto** (`prestonjaysusanto@gmail.com`) using your Supabase project and Google Cloud project **meridian-498300**.

**GitHub repo:** [ShadowEsu/meridian-ai](https://github.com/ShadowEsu/meridian-ai)

**Do not commit** `client_secret_*.json` or `.env` to git. Paste secrets only into Supabase and Render's environment dashboard.

---

## Your project IDs (reference)

| Service | Value |
|---------|-------|
| Supabase project | `berelpcqwplzagtktgnl` |
| Supabase URL | `https://berelpcqwplzagtktgnl.supabase.co` |
| Supabase OAuth callback | `https://berelpcqwplzagtktgnl.supabase.co/auth/v1/callback` |
| Google Cloud project | `meridian-498300` |
| Google OAuth client ID | `609424288083-2l51l52m5lo3evvmaiqb5imdteqbsquf.apps.googleusercontent.com` |
| Google client edit | [Open OAuth client](https://console.cloud.google.com/auth/clients?project=meridian-498300) |

**Production URL (unchanged):** `https://meridian20.onrender.com`

---

## Step 1 — Database (one time)

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/berelpcqwplzagtktgnl/sql/new)
2. Paste all of `schema/000_init.sql` → **Run**
3. Verify:

```sql
select tablename from pg_tables where tablename like 'meridian_%';
```

→ 9 rows

---

## Step 2 — Google OAuth client

Open your client: [Google Cloud → Credentials → meridian-498300](https://console.cloud.google.com/auth/clients?project=meridian-498300)

Click **Meridian web** (or the client ending in `...teqbsquf`).

### Authorized JavaScript origins

Add **both** (keep localhost for local dev):

```
http://localhost:5500
https://meridian20.onrender.com
```

### Authorized redirect URIs

Add **only** the Supabase callback (same for local and production):

```
https://berelpcqwplzagtktgnl.supabase.co/auth/v1/callback
```

**Save.**

### OAuth consent screen (required for public users)

[OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent?project=meridian-498300)

- **Testing mode** → only emails listed under **Test users** can sign in
- **Production** → click **Publish app** so anyone with Google can sign in

For a public demo, publish the app or add every tester email under Test users.

---

## Step 3 — Supabase Google provider

1. [Authentication → Providers → Google](https://supabase.com/dashboard/project/berelpcqwplzagtktgnl/auth/providers?provider=Google)
2. **Enable** Google
3. Paste from your `client_secret_*.json`:
   - **Client ID:** `609424288083-2l51l52m5lo3evvmaiqb5imdteqbsquf.apps.googleusercontent.com`
   - **Client Secret:** the `client_secret` value from the JSON file (`GOCSPX-…`)
4. **Save**

---

## Step 4 — Supabase URL configuration

[Authentication → URL Configuration](https://supabase.com/dashboard/project/berelpcqwplzagtktgnl/auth/url-configuration)

| Field | Value |
|-------|-------|
| **Site URL** | `https://meridian20.onrender.com` |
| **Redirect URLs** | one per line: |

```
http://localhost:5500/**
http://localhost:5500/app**
http://localhost:5500/app?live=1
https://meridian20.onrender.com/**
https://meridian20.onrender.com/app**
https://meridian20.onrender.com/app?live=1
```

Marketing homepage: **`/`** · Dashboard + Google sign-in: **`/app?live=1`** · Legacy `/home` redirects to `/`.

**Save changes.**

---

## Step 5 — Deploy on Render (recommended)

### 5a. Connect repo

1. [render.com/dashboard](https://dashboard.render.com/) → **New** → **Blueprint** (or **Web Service**)
2. Connect GitHub repo **`ShadowEsu/meridian-ai`** (branch `main`)
3. Branch: `main`
4. Render reads `render.yaml` at repo root

Or manual Web Service:

- **Build:** `npm install`
- **Start:** `npm run start:api`
- **Health check path:** `/api/auth/config`

### 5b. Environment variables

In Render → your service → **Environment**, add:

```
NODE_ENV=production
MERIDIAN_STORE=supabase
PORT=10000

JWT_SECRET=<same 64-char hex from your local .env>
ENCRYPTION_KEY=<same 64-char hex from your local .env>

SUPABASE_URL=https://berelpcqwplzagtktgnl.supabase.co
SUPABASE_ANON_KEY=<publishable key from Supabase → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<secret key from same page — never expose in browser>
```

`SUPABASE_JWT_SECRET` is **optional** for this project: Supabase uses **ECC (P-256)** signing keys. The Node backend verifies Google tokens via `GET /auth/v1/user` using `SUPABASE_URL` + `SUPABASE_ANON_KEY` only.

Copy values from your local `.env` (never commit `.env`). If you pasted keys in chat, rotate them in Supabase → Settings → API.

### 5c. First deploy

Deploy → service URL should remain **`https://meridian20.onrender.com`** (Render service name `meridian20`).

---

## Step 6 — Smoke test

```bash
curl https://meridian20.onrender.com/api/auth/config
# → { "googleEnabled": true, "supabaseUrl": "...", ... }

curl https://meridian20.onrender.com/api/models
# → model catalogue JSON
```

In browser:

1. Open `https://meridian20.onrender.com/`
2. Should auto-detect live mode (probes `/api/auth/config`)
3. Click **Sign in with Google**
4. Land in dashboard after Google approves

---

## Step 7 — Wire your apps (see traffic in dashboard)

After sign-in:

1. **Settings / onboarding** → add OpenAI / Anthropic provider keys
2. Create **teams** (one per app)
3. Create **virtual keys** → save each `mk_…` secret
4. From each app, POST after every LLM call:

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

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Google redirect URI must be exactly `https://berelpcqwplzagtktgnl.supabase.co/auth/v1/callback` |
| Google works locally, not on Render | Add Render URL to Google **JavaScript origins** + Supabase **Redirect URLs** |
| `Access blocked` / app not verified | Publish OAuth consent screen or add user as Test user |
| `Could not establish session` | Run `schema/000_init.sql` in Supabase |
| `Invalid Supabase token` | Check `SUPABASE_ANON_KEY` (publishable) and `SUPABASE_URL`; ECC projects do not need `SUPABASE_JWT_SECRET` |
| Render free tier sleeps | First request after idle takes ~30s; upgrade or use a keep-alive ping |
| Blank page | Must use `npm run start:api` (not static `npm start` on port 3000) |

---

## Security reminders

- Rotate Supabase + Google secrets if they were ever pasted in chat or committed
- Never commit `.env` or `client_secret_*.json`
- `SUPABASE_SERVICE_ROLE_KEY` stays server-side only (Render env, not browser)

---

## Quick link index

| Task | Link |
|------|------|
| Supabase dashboard | https://supabase.com/dashboard/project/berelpcqwplzagtktgnl |
| Google OAuth clients | https://console.cloud.google.com/auth/clients?project=meridian-498300 |
| Google consent screen | https://console.cloud.google.com/apis/credentials/consent?project=meridian-498300 |
| Supabase Google provider | https://supabase.com/dashboard/project/berelpcqwplzagtktgnl/auth/providers?provider=Google |
| Supabase URL config | https://supabase.com/dashboard/project/berelpcqwplzagtktgnl/auth/url-configuration |
| Supabase SQL editor | https://supabase.com/dashboard/project/berelpcqwplzagtktgnl/sql/new |
| Render dashboard | https://dashboard.render.com/ |

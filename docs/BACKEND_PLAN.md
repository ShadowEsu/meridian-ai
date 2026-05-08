# Meridian — Backend Plan

> Engineering companion to `GOAL.md`. `GOAL.md` is the high-level mission; this
> file is the concrete plan a developer follows to build the backend, end to end.
>
> Scope: real **sign in / sign up** (password + email-code), **Settings**
> (profile, providers, teams, budgets, audit log), and the **ML data pipeline**
> that feeds a router model the user retrains weekly to pick the cheapest
> model that still meets quality.

---

## 0. Where we are today

What already exists and works:

- `server/index.with-api.js` — Express server with:
  - `helmet`, `cookie-parser`, JSON body limit (256kb), `trust proxy` aware.
  - `zod` validation on every body/params/query input.
  - Rate limits: global `/api` 120/min IP, `auth` 20/15min IP,
    `userWriteLimiter` 60/min user, `proxyLimiter` 30/min user. All return a
    structured 429 with `code: "RATE_LIMITED"`.
  - `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`,
    `GET /api/auth/me`. Passwords hashed with `bcryptjs` (cost 12).
  - JWT session cookie: `httpOnly`, `sameSite=lax`, `secure` in prod,
    7-day expiry, signed with `JWT_SECRET`.
  - `GET / POST / DELETE /api/provider-keys` — AES-256-GCM (`crypto-secret.js`),
    only the masked tail (`abcd···wxyz`) is ever returned.
  - `POST /api/proxy/anthropic/...` and `POST /api/proxy/openai/...` —
    pass-through with the user’s decrypted key.
- `server/json-store.js` — flat-file JSON store under `data/meridian-store.json`
  for users + provider keys. **No** agents, requests, budgets, or audit yet.
- `python/router_service/` — scaffold with `features.py`, `train.py`,
  `main.py`, `requirements.txt`, plus `TRAINING_GUIDE.md`. No training data
  exporter from Node yet, no FastAPI server yet.
- `page-auth.jsx` — fully styled but currently **not loaded** in `Meridian.html`
  (the demo is gated open).

What is missing (this plan addresses it):

1. Email-code (OTP) sign-up/sign-in option, password reset.
2. Settings page + endpoints (profile, teams, budgets, audit log).
3. Agents, runs, requests, budgets schemas + endpoints.
4. ML training-data exporter, schemas, FastAPI server, Node integration.
5. Switchable storage backend (`json` for dev, `supabase` for prod).
6. Production hardening (CSP, audit log, key rotation, doctor script).

---

## 1. Auth — sign in / sign up

### 1.1 Two flows, one source of truth

We support two ways to authenticate **the same account**:

| Flow            | When to use                                  | What we store                                   |
| --------------- | -------------------------------------------- | ----------------------------------------------- |
| Password        | Power users, CLIs, quick re-login            | `users.password_hash` (bcrypt cost 12)          |
| Email OTP code  | First-time signup, password recovery, magic  | One-time `email_codes(code_hash, expires_at)`   |

Both produce the same `meridian_session` JWT cookie. A user can have either or
both credentials enabled. After sign-up via email-code we let them set a
password from the Settings page.

### 1.2 Schema additions

```sql
-- already implicitly in json-store; mirror in Supabase:
users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  password_hash text,          -- nullable: OTP-only users
  name text,
  avatar_url text,
  created_at timestamptz default now(),
  last_login_at timestamptz
);

email_codes (
  id bigserial primary key,
  email citext not null,
  code_hash text not null,     -- sha256 of code; never store plain code
  purpose text not null,       -- 'signup' | 'login' | 'reset'
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts int default 0,
  created_ip text
);

audit_log (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  event text not null,         -- 'signin.password' | 'signin.code' | 'key.create' ...
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz default now()
);
```

In the JSON store we add the same shapes inside `data/meridian-store.json`
(`emailCodes`, `auditLog`).

### 1.3 Endpoints (additions to `server/index.with-api.js`)

All return JSON. All use `authLimiter` (IP) and a per-email limiter we add.

```
POST /api/auth/request-code
  body: { email, purpose: 'signup' | 'login' | 'reset' }
  - generates 6-digit numeric code
  - stores sha256(code) with 10-minute expiry
  - sends email via provider (Resend/Postmark/Supabase) — never log the code
  - response is 200 even if the email is unknown (no enumeration)

POST /api/auth/verify-code
  body: { email, code, password? }
  - constant-time compare against sha256(code) for the latest unconsumed row
  - increments attempts; locks email after 5 failures in 15 min
  - on success: marks consumed, sets session cookie
  - if password is provided AND purpose is 'signup' or 'reset', upserts
    password_hash atomically

POST /api/auth/signup           (existing — keeps password flow)
POST /api/auth/login            (existing)
POST /api/auth/logout           (existing)
GET  /api/auth/me               (existing)

POST /api/auth/change-password  (requireUser)
  body: { currentPassword, newPassword }

POST /api/auth/request-reset
  body: { email }
  -> just calls request-code with purpose='reset'
```

### 1.4 Per-email rate limit

Add a second `rateLimit` keyed on `body.email.toLowerCase()` for the OTP
endpoints, with: 3 requests / minute, 20 / day. Use `keyGenerator` reading the
already-validated body via `req.validated`.

### 1.5 Cookie + session rules

- 7-day cookie, but the JWT carries `iat`. On every request, if `now - iat >
  24h`, re-sign and re-set the cookie (rolling refresh).
- Idle timeout: if `now - last_login_at > 14d`, force re-auth.
- `POST /api/auth/logout` clears cookie AND deletes any matching
  Supabase session (when we move to Supabase).

### 1.6 Frontend (`page-auth.jsx`)

Re-enable the file in `Meridian.html`. The component already has password
form. Add:

- Tab segment: `Password` / `Email code` (default to email-code on signup).
- “Email code” tab is two steps: enter email → 6-digit input → land in app.
- “Forgot password?” link → request-code with purpose `reset`, then a panel
  to set a new password.
- All fetches go to same-origin `/api/auth/*` (matches existing code).

---

## 2. Settings page

The Settings screen is the “my account + my workspace” surface. It needs both
a UI page and backed-up endpoints. Suggested left-rail tabs:

1. **Profile** — name, email, avatar, password.
2. **Providers** — list/add/revoke encrypted provider keys. (Already exists.)
3. **Teams** — create/rename/delete teams; map prompt sources to teams; this
   is the “customizable Spend by Team” feature the user asked for.
4. **Budgets** — per-team monthly cap, soft cap, alert threshold.
5. **Notifications** — email threshold alerts, agent kill alerts.
6. **Audit log** — last 100 events for this user.
7. **Danger zone** — export data, delete account.

### 2.1 Schema additions

```sql
teams (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  name text not null,
  slug text not null,
  color text,
  created_at timestamptz default now(),
  unique(user_id, slug)
);

team_sources (                  -- mapping prompt sources/apps -> teams
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  team_id bigint references teams(id) on delete cascade,
  source_type text not null,    -- 'app' | 'agent' | 'tag' | 'email_domain'
  source_value text not null,
  created_at timestamptz default now()
);

budgets (
  user_id uuid references users(id) on delete cascade,
  team_id bigint references teams(id) on delete cascade,
  monthly_cap_usd numeric(10,2) not null default 0,
  soft_cap_usd numeric(10,2),
  alert_threshold_pct int not null default 80,
  primary key (user_id, team_id)
);

notification_prefs (
  user_id uuid primary key references users(id) on delete cascade,
  budget_alert_email boolean default true,
  agent_kill_email boolean default true,
  weekly_digest_email boolean default true
);
```

### 2.2 Endpoints

```
# profile
GET    /api/me
PATCH  /api/me                  body: { name?, avatarUrl? }
POST   /api/me/avatar           multipart, max 256kb, stored under data/avatars
DELETE /api/me                  soft-delete + 30-day purge job

# teams
GET    /api/teams
POST   /api/teams               body: { name, color? }
PATCH  /api/teams/:id           body: { name?, color? }
DELETE /api/teams/:id

# team sources (the “customizable Spend by Team” mapping)
GET    /api/teams/:id/sources
POST   /api/teams/:id/sources   body: { sourceType, sourceValue }
DELETE /api/teams/:id/sources/:sid

# budgets
GET    /api/budgets
PUT    /api/budgets/:teamId     body: { monthlyCapUsd, softCapUsd?, alertThresholdPct? }

# notifications
GET    /api/notifications
PATCH  /api/notifications

# audit
GET    /api/audit?limit=100&before=ISO
```

All write endpoints go through `userWriteLimiter` and `validate(zodSchema)`.
All write endpoints append a row to `audit_log`.

### 2.3 What the UI does

- The existing **Spend by Team** card on Overview reads from `GET /api/teams`
  + `GET /api/insights/team-spend?range=mtd`. The user can drag prompt
  sources between teams in Settings → Teams; the dashboard re-aggregates next
  reload.
- Provider key management on **Virtual Keys** page (existing UI) calls the
  existing `/api/provider-keys` routes — no change needed there.

---

## 3. Operational backend (agents, requests, budgets data)

Even before ML, the dashboard needs real numbers. We add the data plane that
the UI is already shaped for.

### 3.1 Schema

```sql
agents (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  team_id bigint references teams(id) on delete set null,
  name text not null,
  status text not null default 'idle',     -- idle|running|terminated|errored
  capability_required jsonb default '[]',  -- e.g. ["code","json"]
  created_at timestamptz default now(),
  started_at timestamptz,
  terminated_at timestamptz,
  terminated_reason text
);

agent_runs (
  id bigserial primary key,
  agent_id bigint references agents(id) on delete cascade,
  started_at timestamptz default now(),
  ended_at timestamptz,
  cost_usd numeric(10,4) default 0,
  calls int default 0,
  loop_score numeric(5,4),
  terminated_reason text
);

requests (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  agent_run_id bigint references agent_runs(id) on delete cascade,
  team_id bigint references teams(id) on delete set null,
  provider text not null,          -- 'openai' | 'anthropic' | ...
  model text not null,             -- 'gpt-4o-mini' | 'claude-3-5-haiku' ...
  tier text,                       -- 'cheap' | 'mid' | 'premium'
  prompt_hash text not null,       -- sha256 of normalized prompt; NEVER raw
  prompt_features jsonb,           -- see §4.2
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,6),
  latency_ms int,
  status text not null,            -- 'ok' | 'retried' | 'escalated' | 'failed'
  retried_with_model text,
  quality_score numeric(4,3),      -- nullable; 0..1 if scored
  created_at timestamptz default now()
);

create index on requests (user_id, created_at desc);
create index on requests (team_id, created_at desc);
```

### 3.2 Endpoints

```
GET  /api/agents
POST /api/agents                          body: { name, teamId, capability_required? }
POST /api/agents/:id/start
POST /api/agents/:id/terminate            body: { reason }

GET  /api/requests?from=&to=&team=&model=&status=
POST /api/requests                        # called by proxy after a real call

GET  /api/insights/summary                # totals for Overview hero cards
GET  /api/insights/team-spend?range=mtd
GET  /api/insights/model-mix?range=mtd
GET  /api/insights/budgets                # join budgets + spend mtd
```

The two LLM proxy endpoints (`/api/proxy/openai/...`,
`/api/proxy/anthropic/...`) MUST also write a `requests` row after each call,
filling `tokens_in`, `tokens_out`, `cost_usd`, `latency_ms`, `status`. This
is the canonical training-data source.

### 3.3 Storage strategy: `MERIDIAN_STORE`

Add an env switch:

```
MERIDIAN_STORE=json     # default — file-based dev
MERIDIAN_STORE=supabase # prod — Postgres + RLS
```

A new `server/store/index.js` exports a single interface; behind it sit
`store-json.js` (extends current `json-store.js`) and `store-supabase.js`.
All route handlers use the interface — no Postgres-specific code in routes.

---

## 4. ML data pipeline (the part the user trains weekly)

The router model picks the cheapest model that is still likely to succeed.
This section is the "where does the training data come from" answer in
concrete code paths.

### 4.1 Data lifecycle

```
┌────────────┐   write    ┌──────────────┐  daily export   ┌───────────────────┐
│ proxy call │──────────► │  requests    │ ───────────────►│  parquet/csv per  │
└────────────┘            │  table       │                  │  week (artifacts) │
                          └──────┬───────┘                  └─────────┬─────────┘
                                 │  label rule                       train_weekly.py
                                 ▼                                    │
                          ┌──────────────┐                            ▼
                          │  labels view │  ◄────────────────  python/router_service
                          └──────────────┘                     model artifact + metrics
                                                                      │
                                                                      ▼
                                                          serve.py (FastAPI /route)
                                                                      │
                                                                      ▼
                                              Node API consults router for next call
```

### 4.2 What we record per request (`prompt_features`)

We store derived numeric features instead of raw prompts (privacy). Computed
in Node before insert with a small helper at `server/feature-extract.js`:

```js
{
  len_chars: 1247,
  len_words: 198,
  sentence_count: 14,
  has_code_fence: true,
  has_json_braces: false,
  has_url: false,
  digit_ratio: 0.04,
  non_ascii_ratio: 0.00,
  capability_required: ["code"],
  hour_of_day: 14,
  day_of_week: 3,
  team_id: 7,
  expected_tokens_in: 412,    // tokenizer estimate
  expected_tokens_out: 256,
  prior_failure_rate_30d: {   // rolling cache, refreshed nightly
    "gpt-4o-mini":   0.018,
    "claude-3-5-haiku": 0.022,
    "gpt-4o":        0.004
  },
  current_unit_cost: {
    "gpt-4o-mini":   0.00015,
    "gpt-4o":        0.0050,
    "claude-3-5-haiku": 0.00080
  }
}
```

`prompt_hash` is `sha256(normalize(prompt))` — used to dedupe identical
prompts and, optionally, attach a separate quality score later without
storing the prompt itself.

### 4.3 Labels (what the model learns)

Two labeling strategies — start with (a), graduate to (b):

**(a) Implicit label from outcomes (recommended week 1):**

```
y_success = 1 if status='ok' and not retried_with_model
            and (quality_score is null OR quality_score >= 0.6)
y_success = 0 otherwise
```

For training the router as a *cost-aware classifier*, the row becomes:

```
features → P(success | features, model_used)
```

We then choose the cheapest model for which predicted `P(success) >= θ`
(default θ = 0.85, configurable per team).

**(b) Counterfactual label (later, when we have judge model or human
review):** for a sample of prompts we run *all* tiers and label the cheapest
tier that passed quality. This gives a direct multi-class label
`label_tier ∈ {cheap, mid, premium}`.

Both labels live as Postgres views (or json-store derived columns), not
duplicated columns:

```sql
create view ml_training_rows as
select
  r.id,
  r.created_at,
  r.user_id,
  r.team_id,
  r.model,
  r.tier,
  r.prompt_features,
  r.cost_usd,
  case
    when r.status = 'ok' and r.retried_with_model is null
         and (r.quality_score is null or r.quality_score >= 0.6)
    then 1 else 0
  end as y_success
from requests r
where r.created_at >= now() - interval '90 days';
```

### 4.4 Weekly export

`scripts/export_training_data.js` (new):

- runs at the start of `train_weekly.py` via subprocess, OR on a cron;
- pulls `ml_training_rows` for the last 7 days (configurable);
- writes to `python/router_service/data/exports/YYYY-WW_router.parquet`
  (CSV fallback);
- prints row count, class balance, cost-weighted class balance, and the
  hash of the export so the artifact is reproducible.

### 4.5 Training (`python/router_service/train_weekly.py`)

Pseudocode:

```python
df = pd.read_parquet(latest_export())
X = build_features(df)              # numeric + one-hot categoricals
y = df["y_success"].values
groups = df["user_id"].values       # for GroupKFold (no per-user leakage)

clf = lgb.LGBMClassifier(
    n_estimators=400, learning_rate=0.05,
    num_leaves=31, min_child_samples=50,
    class_weight="balanced",
)

cv = GroupKFold(n_splits=5)
auc, brier, savings = [], [], []
for tr, te in cv.split(X, y, groups):
    clf.fit(X.iloc[tr], y[tr])
    p = clf.predict_proba(X.iloc[te])[:, 1]
    auc.append(roc_auc_score(y[te], p))
    brier.append(brier_score_loss(y[te], p))
    savings.append(simulate_savings(df.iloc[te], p, theta=0.85))

print({"auc": mean(auc), "brier": mean(brier),
       "expected_weekly_savings_usd": mean(savings)})

# only promote if new model beats current on savings AND auc within 1%:
if better_than_current(...):
    save(clf, "artifacts/{YYYY}-{WW}/router.lgbm")
    write_manifest(version, metrics, feature_list, theta_default)
```

Companion:

- `train.py` — same code, ad-hoc invocation for experimentation.
- `features.py` — single source of truth for the feature pipeline (Node and
  Python use the same field names; Python recomputes from
  `prompt_features` JSON).
- `evaluate.py` — produces a markdown report under `artifacts/.../REPORT.md`
  with calibration plot (PNG), cost-vs-failure curve, and confusion matrix.

### 4.6 Serving (`python/router_service/serve.py`)

FastAPI:

```
POST /route
  body: {
    candidate_models: [{ name, provider, unit_cost_in, unit_cost_out, capabilities }],
    features: { ... prompt_features object ... },
    theta?: 0.85,
    require?: ["code"]      // hard filter on capabilities
  }
  -> {
    chosen: { provider, model, why },
    ranked: [{ model, p_success, expected_cost, decision }],
    model_version: "2026-W19"
  }

POST /loop-score
  body: { agent_id, recent_prompt_hashes: [...], recent_costs: [...] }
  -> { score, reasons, recommend_terminate }
GET  /health    -> { ok: true, version, loaded_at }
```

The Node side calls `http://127.0.0.1:8088/route` with a 250ms timeout. On
timeout/5xx it falls back to the **v0 rules table**:

```js
// server/router-rules.js
function pickCheapest(candidates, features) {
  const eligible = candidates.filter(m =>
    features.capability_required.every(c => m.capabilities.includes(c))
  );
  const estTokens = features.expected_tokens_in + features.expected_tokens_out;
  return eligible
    .map(m => ({ ...m, cost: m.unit_cost_in * features.expected_tokens_in
                       + m.unit_cost_out * features.expected_tokens_out }))
    .sort((a, b) => a.cost - b.cost)[0];
}
```

The router NEVER blocks the upstream call — if it can’t answer in time, we
use rules. Failing the router must not fail user requests.

### 4.7 Weekly runbook (the one the user runs)

```
# 1. Export the last 7 days of data
node scripts/export_training_data.js --days 7

# 2. Train + evaluate
cd python/router_service
python train_weekly.py

# 3. Inspect artifacts/2026-W19/REPORT.md and metrics.json
# 4. If happy, mark active:
python promote.py 2026-W19

# 5. Reload the FastAPI server
kill -HUP $(cat .pid)
```

This is the loop the user iterates each week. Everything is reproducible:
each artifact directory contains the export hash, feature schema version,
model file, metrics, calibration plot, and a `manifest.json`.

### 4.8 Privacy + safety rules (do not break)

- Never store raw prompts in `requests`. Only `prompt_hash` + features.
- Never POST raw prompts to the router service in production. Only the
  features object + candidate model list.
- The router service runs on `127.0.0.1` only by default, no public bind.
- Versioned artifact directories are immutable; promotion is a rename of
  the `current` symlink.
- A failing router must degrade silently to rules; users never see latency
  spikes from ML.

---

## 5. Cross-cutting: security and ops

### 5.1 Audit log

Every state-changing endpoint appends a row:

```js
audit(req, "key.create", { provider, mask });
audit(req, "team.update", { teamId, diff });
audit(req, "agent.terminate", { agentId, reason });
audit(req, "auth.signin.code", { email });   // mask email in logs
```

Settings → Audit shows last 100 entries (newest first), filterable by event.

### 5.2 Secrets and config

- `.env.example` (existing) gains:
  ```
  EMAIL_PROVIDER=resend|postmark|supabase
  EMAIL_API_KEY=...
  EMAIL_FROM=meridian@yourdomain.dev
  SUPABASE_URL=
  SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  MERIDIAN_STORE=json
  ROUTER_SERVICE_URL=http://127.0.0.1:8088
  ```
- A `scripts/doctor.js` prints which secrets are missing, whether
  `JWT_SECRET` is ≥32 chars, whether `ENCRYPTION_KEY` is hex-32, and whether
  Supabase RLS is enabled (when applicable). Run via `npm run doctor`.

### 5.3 CSP

Production HTML gets a strict CSP via helmet:

```
default-src 'self';
script-src  'self' 'unsafe-inline'   <-- only in dev for babel; remove in prod
            https://unpkg.com;
connect-src 'self' https://api.openai.com https://api.anthropic.com
            https://*.supabase.co;
img-src     'self' data:;
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src    'self' https://fonts.gstatic.com;
frame-ancestors 'none';
```

Document the dev/prod difference in README. Production build replaces the
`<script type="text/babel">` blocks with prebuilt bundles so we can drop
`'unsafe-inline'`.

### 5.4 Tests (lightweight)

- `vitest` (Node):
  - email normalization, masking, validation error shape
  - rate-limit key generator (IP vs user)
  - JSON store: create user, dup email, encrypt/decrypt roundtrip
- `pytest` (Python):
  - `features.build_features` deterministic on same input
  - `simulate_savings` matches a hand-computed example
  - manifest writer never overwrites without a version bump

### 5.5 Observability

Add a tiny `server/log.js` with leveled logs (`info`, `warn`, `error`). Mask
tokens, codes, and key fragments. Never log full emails — log the local
hash + domain (e.g. `acc***@gmail.com`).

---

## 6. Migration sequence

Land in this order so each step is shippable on its own:

1. **Audit log + storage interface** (`MERIDIAN_STORE` switch, JSON impl).
2. **Settings: profile + password change** + audit-log UI.
3. **Email-code auth** (request-code, verify-code, per-email rate limit).
4. **Teams + budgets + notifications** endpoints + UI.
5. **Agents + requests** schema and endpoints; proxy writes `requests`.
6. **Insights endpoints** powering Overview + Virtual Keys cards.
7. **Training-data exporter** (`scripts/export_training_data.js`).
8. **Python training pipeline** (`train_weekly.py`, `evaluate.py`,
   `promote.py`).
9. **FastAPI router service** + Node integration with rules fallback.
10. **Production hardening**: CSP, doctor script, JWT rotation, prebuilt JS.

Each step ships behind feature-branch + PR with screenshots + test plan.

---

## 7. Acceptance criteria

A reviewer should be able to verify, in order:

- [ ] I can sign up with `email + 6-digit code`, then later set a password.
- [ ] I can sign in with password OR email-code; both produce the same
      session and audit-log entry.
- [ ] Settings: profile edit, password change, team CRUD, budget edit,
      notification toggles all persist and show audit entries.
- [ ] Adding an OpenAI key via Settings → Providers stores AES-256-GCM
      ciphertext; only the mask is shown in the UI; the key is never echoed
      back from any endpoint.
- [ ] After running an LLM proxy call, a row appears in `requests` with
      `prompt_features`, no raw prompt stored.
- [ ] `node scripts/export_training_data.js --days 7` writes a parquet to
      `python/router_service/data/exports/`.
- [ ] `python train_weekly.py` writes
      `artifacts/YYYY-WW/{router.lgbm, metrics.json, REPORT.md, manifest.json}`
      and prints AUC + simulated savings.
- [ ] `serve.py` answers `POST /route` in <50ms locally and the Node API uses
      it; killing the Python service makes the dashboard fall back to rules
      with no user-visible failure.
- [ ] `npm run doctor` reports green; CSP is active in production mode.

---

## 8. Open questions (answer before coding)

1. **Email provider** — Resend (cheap), Postmark (deliverability), or
   Supabase Auth’s built-in mailer (zero infra, less control)?
2. **Storage backend for v1** — keep JSON store, or jump straight to
   Supabase? (JSON is fine for solo dev; Supabase unlocks RLS.)
3. **Quality scoring** — judge-model in the loop (extra cost) or human
   spot-check sample (slower but free)?
4. **Router placement** — same machine as Node API (simpler) vs separate
   service / serverless (better isolation, more ops)?
5. **Default routing threshold θ** — start at 0.85? Per-team override
   pattern in Settings → Teams?

When unanswered, build the surrounding code behind an env flag and stub the
integration so we can swap providers without re-architecting.

---

## 9. Where this lives in the repo

- `BACKEND_PLAN.md` (this file) — the engineering plan.
- `GOAL.md` — agent-facing brief / mission.
- `ML_PLAN.md` — ML conceptual primer (already exists; this plan extends it
  with concrete tables, exporter, manifest format).
- `python/router_service/TRAINING_GUIDE.md` — runbook for the weekly loop.
- `server/index.with-api.js` — wiring; new routes get added here.
- `server/store/{index,json,supabase}.js` — new abstraction.
- `scripts/export_training_data.js` — exporter to parquet/CSV.
- `python/router_service/{train_weekly,evaluate,promote,serve}.py` — model
  lifecycle.

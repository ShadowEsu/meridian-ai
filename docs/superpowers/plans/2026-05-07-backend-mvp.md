# Meridian Backend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every `window.MERIDIAN.*` mock-data read in the frontend with real API endpoints backed by a persistent store, so the dashboard reflects real users, real provider keys, real virtual keys, real agents, real alerts, and a real per-request log.

**Architecture:** Express HTTP server, modular route files, JSON file store behind a storage interface (Supabase adapter is a follow-up). Per-request log is the source of truth — KPIs, feed, agent runs, key spend all aggregate over it. Vitest + supertest for HTTP tests. Frontend keeps the no-bundler demo path; a `MERIDIAN_LIVE` flag toggles between mock and API data via a thin `src/core/api.js` client.

**Tech Stack:** Node ≥18, Express 4, zod, helmet, express-rate-limit, jsonwebtoken, bcryptjs, dotenv, cookie-parser, vitest, supertest. Frontend stays React 18 + Babel-standalone.

**What this plan does NOT do** (deferred to follow-up plans):
- Supabase migration (PLAN.md M2)
- Cost-router ML integration (PLAN.md M4)
- OTP / email-code auth (PLAN.md M1 partial — only password auth here)
- Tightened CSP / Vite bundler (PLAN.md M6)
- Provider proxy real-traffic ingestion (the proxy stays as-is; ingestion happens via `POST /api/v1/requests` from any client/SDK for now)

---

## Architecture overview

### Request ingestion is the keystone

Everything the dashboard shows is a view over the `requests` log:

```
client/SDK
   │ POST /api/v1/requests   header: X-Meridian-Key: vk_xxx
   ▼
┌────────────────────────────┐
│ requests route             │
│  1. lookup virtual key     │
│  2. compute cost (pricing) │
│  3. budget engine deducts  │
│  4. alert engine matches   │
│  5. append to request log  │
│  6. append audit entry     │
└────────────────────────────┘

dashboard
   │ GET /api/kpi/overview
   │ GET /api/requests?...
   │ GET /api/agents/:id/runs
   ▼
read-only aggregations over request log + domain tables
```

### Auth model

- Dashboard endpoints: cookie session (existing `requireUser` middleware).
- Ingestion endpoint: virtual key in `X-Meridian-Key` header, validated against the `virtualKeys` table.
- Both paths converge on `req.user` so audit logging is uniform.

### File structure (target)

```
server/
├── index.js                     # static-only entry (existing, unchanged)
├── index.with-api.js            # API entry — slimmed to: load env, create store, build app, listen
├── app.js                       # NEW — createApp({ store }) factory; testable
├── auth-middleware.js           # existing
├── crypto-secret.js             # existing
├── lib/
│   ├── validate.js              # NEW — extracted zod middleware
│   ├── rate-limiters.js         # NEW — extracted limiter factory
│   └── errors.js                # NEW — jsonError + error codes
├── store/
│   ├── index.js                 # NEW — createStore() factory; selects json|supabase
│   ├── json.js                  # NEW — replaces server/json-store.js with extended schema
│   └── supabase.js              # NEW — stub that throws "not implemented" (M2)
├── routes/
│   ├── auth.js                  # NEW — extracted from index.with-api.js
│   ├── provider-keys.js         # NEW — extracted
│   ├── teams.js                 # NEW
│   ├── virtual-keys.js          # NEW
│   ├── agents.js                # NEW
│   ├── alerts.js                # NEW
│   ├── requests.js              # NEW — POST ingest + GET query
│   ├── kpi.js                   # NEW — overview + feed counters
│   ├── audit-log.js             # NEW — read-only
│   └── proxy.js                 # NEW — extracted (anthropic + openai)
└── services/
    ├── audit-log.js             # NEW — append({ userId, action, target, meta })
    ├── pricing.js               # NEW — costFor({ provider, model, promptTokens, completionTokens })
    ├── budget-engine.js         # NEW — assertWithinBudget + recordSpend
    └── alert-engine.js          # NEW — matchAndTrigger(request)

scripts/
├── doctor.js                    # NEW — validates env + store
└── seed-demo.js                 # NEW — populates JSON store with demo fixtures

test/
├── helpers/
│   └── make-app.js              # NEW — builds app + temp JSON store per test
├── server/
│   ├── auth.test.js
│   ├── provider-keys.test.js
│   ├── teams.test.js
│   ├── virtual-keys.test.js
│   ├── agents.test.js
│   ├── alerts.test.js
│   ├── requests.test.js
│   ├── kpi.test.js
│   └── audit-log.test.js
└── services/
    ├── pricing.test.js
    ├── budget-engine.test.js
    └── alert-engine.test.js
```

### Store schema (JSON shape)

`data/meridian-store.json` grows from 4 keys to 11. Existing `users` and `providerKeys` are unchanged. New tables:

```js
{
  nextUserId, nextKeyId, nextTeamId, nextVirtualKeyId,
  nextAgentId, nextAgentRunId, nextAlertId, nextRequestId, nextAuditId,
  users: [...],            // existing
  providerKeys: [...],     // existing
  teams: [
    { id, userId, name, monthlyBudgetUsd, createdAt }
  ],
  virtualKeys: [
    { id, userId, teamId, providerKeyId,
      label, prefix,                       // prefix shown in UI; full key never stored
      keyHash,                             // bcrypt hash of the secret part
      monthlyBudgetUsd,                    // null = no cap
      status,                              // 'active' | 'paused' | 'revoked'
      spentMtdUsd,                         // running total, reset monthly
      lastUsedAt,
      createdAt }
  ],
  agents: [
    { id, userId, teamId, name, description,
      status,                              // 'idle' | 'running' | 'paused'
      maxRunCostUsd,                       // safety cap per run
      maxLoopIterations,                   // runaway protection
      createdAt }
  ],
  agentRuns: [
    { id, agentId, userId, startedAt, endedAt,
      status,                              // 'running' | 'completed' | 'killed' | 'failed'
      requestCount, costUsd, iterationCount,
      lastRequestId }
  ],
  alerts: [
    { id, userId,
      name,
      type,                                // 'team_budget' | 'key_budget' | 'agent_loop' | 'spike'
      target,                              // { teamId } or { virtualKeyId } or { agentId } or {}
      thresholdUsd,                        // for budget types
      thresholdRpm,                        // for spike type
      windowMinutes,                       // sliding window for spike
      state,                               // 'active' | 'paused' | 'triggered'
      lastTriggeredAt,
      createdAt }
  ],
  requests: [
    { id, userId, virtualKeyId, teamId, agentId,
      provider,                            // 'anthropic' | 'openai' | 'google' | 'mistral'
      model,
      promptTokens, completionTokens,
      latencyMs,
      costUsd,
      status,                              // 'ok' | 'error' | 'rate_limited'
      taskType,                            // optional client-supplied label
      timestamp }
  ],
  auditLog: [
    { id, userId, action, target, meta, ip, timestamp }
  ]
}
```

`requests` will be the largest collection. JSON store is fine up to ~50k rows on a developer laptop; Supabase adapter is the upgrade path (PLAN.md M2).

### Pricing table

Hard-coded in `server/services/pricing.js`. Per 1M tokens:

| Provider  | Model                    | Input USD/Mtok | Output USD/Mtok |
|-----------|--------------------------|---------------:|----------------:|
| anthropic | claude-opus-4-7          | 15.00          | 75.00           |
| anthropic | claude-sonnet-4-6        |  3.00          | 15.00           |
| anthropic | claude-haiku-4-5         |  1.00          |  5.00           |
| openai    | gpt-4.1                  |  3.00          | 12.00           |
| openai    | gpt-4.1-mini             |  0.40          |  1.60           |
| openai    | gpt-4.1-nano             |  0.10          |  0.40           |
| google    | gemini-2.5-pro           |  1.25          |  5.00           |
| google    | gemini-2.5-flash         |  0.075         |  0.30           |
| mistral   | mistral-large-2          |  2.00          |  6.00           |

Unknown model returns `null` (the route should accept the request with `costUsd: 0` and a `console.warn`; alerts and KPIs treat `null` as zero). Pricing table will move to a JSON file in a follow-up; for MVP it is a constant.

### Testing approach

- **vitest + supertest.** Boot a fresh app with a temp JSON store per test file.
- **TDD discipline** for the parts with logic: pricing, budget engine, alert engine, virtual-key generation, request aggregation. Write the failing test first, then implement.
- **Pragmatic for plumbing**: thin CRUD routes get one happy-path supertest assertion that they wrote/read the right shape; we don't TDD getters.
- **No mocking the store.** Tests use the real JSON store with a temp file.

### Decision log (in addition to PLAN.md)

- Stay on plain JS (not TypeScript). Mid-project migration is high-cost, low-value while the API surface is still in flux. Revisit after M3 ships.
- Single store interface for both JSON and (future) Supabase, both async. JSON adapter wraps sync `fs` calls in `Promise.resolve()` so callers don't need to know.
- Virtual keys store a bcrypt **hash** of the secret. The full key is shown to the user **once** at creation time and never again. UI must persist it client-side immediately if the user wants to copy it.
- Per-team budgets are advisory in MVP — the alert engine flags overage but does not refuse new requests. Hard enforcement is M3+ once we have predictable provider response times.
- Request ingestion deduplicates on `(virtualKeyId, idempotencyKey)` if the client supplies `Idempotency-Key`. Without that header, every request is appended.

---

## Tasks

### Task 1: Test infrastructure

**Files:**
- Modify: `package.json` (add devDependencies + test script)
- Create: `vitest.config.js`
- Create: `test/helpers/make-app.js`
- Create: `test/server/smoke.test.js`

- [ ] **Step 1: Add vitest + supertest as devDependencies and a test script**

```bash
npm install --save-dev vitest@^2.1.0 supertest@^7.0.0
```

Then in `package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
'use strict';
module.exports = {
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    testTimeout: 10000,
    pool: 'forks',
  },
};
```

- [ ] **Step 3: Create `test/helpers/make-app.js`**

This helper boots a fresh app + temp store per test. It anticipates `server/app.js` and `server/store/index.js` from later tasks; the smoke test in step 5 verifies it loads.

```js
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function makeTempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-test-'));
  return path.join(dir, 'store.json');
}

function makeApp() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  const storePath = makeTempStorePath();
  const { createStore } = require('../../server/store');
  const { createApp } = require('../../server/app');
  const store = createStore({ kind: 'json', path: storePath });
  const app = createApp({ store });
  return { app, store, storePath };
}

module.exports = { makeApp, makeTempStorePath };
```

- [ ] **Step 4: Write a failing smoke test in `test/server/smoke.test.js`**

```js
'use strict';

const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

describe('smoke', () => {
  it('responds to an unknown route with 404 JSON, not HTML', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/__nope__');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
```

- [ ] **Step 5: Run the test and verify it fails**

```bash
npm test -- smoke
```

Expected: FAIL with "Cannot find module '../../server/store'" (or similar). This is fine — it proves the harness runs and confirms what Task 2 needs to create.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js test/
git commit -m "test: scaffold vitest + supertest harness"
```

---

### Task 2: Storage abstraction

**Files:**
- Create: `server/store/index.js`
- Create: `server/store/json.js`
- Create: `server/store/supabase.js`
- Delete: `server/json-store.js` (after migrating callers)
- Test: `test/server/store.test.js`

The new store is **async** end-to-end. The JSON adapter wraps sync fs in `Promise.resolve()`. The schema is the full one from "Store schema" above; methods land incrementally as later tasks need them.

- [ ] **Step 1: Write the failing test**

```js
// test/server/store.test.js
'use strict';
const fs = require('fs');
const { describe, it, expect, beforeEach } = require('vitest');
const { createStore } = require('../../server/store');
const { makeTempStorePath } = require('../helpers/make-app');

describe('json store', () => {
  let storePath;
  let store;

  beforeEach(() => {
    storePath = makeTempStorePath();
    store = createStore({ kind: 'json', path: storePath });
  });

  it('starts with an empty users table', async () => {
    const all = await store.users.all();
    expect(all).toEqual([]);
  });

  it('addUser persists across reload', async () => {
    await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
    const reloaded = createStore({ kind: 'json', path: storePath });
    const u = await reloaded.users.findByEmail('a@b.com');
    expect(u).toMatchObject({ email: 'a@b.com', passwordHash: 'h' });
    expect(u.id).toBeTypeOf('number');
  });

  it('rejects duplicate email with code DUPLICATE_EMAIL', async () => {
    await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
    await expect(store.users.add({ email: 'A@B.COM', passwordHash: 'h2' }))
      .rejects.toMatchObject({ code: 'DUPLICATE_EMAIL' });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm test -- store
```

Expected: FAIL — `createStore` not exported.

- [ ] **Step 3: Create `server/store/index.js`**

```js
'use strict';

function createStore(opts) {
  const kind = (opts && opts.kind) || process.env.MERIDIAN_STORE || 'json';
  if (kind === 'supabase') {
    const { createSupabaseStore } = require('./supabase');
    return createSupabaseStore(opts);
  }
  const { createJsonStore } = require('./json');
  return createJsonStore(opts);
}

module.exports = { createStore };
```

- [ ] **Step 4: Create `server/store/supabase.js` (stub)**

```js
'use strict';

function createSupabaseStore() {
  throw new Error('Supabase store is not implemented yet (PLAN.md M2). Set MERIDIAN_STORE=json or unset it.');
}

module.exports = { createSupabaseStore };
```

- [ ] **Step 5: Create `server/store/json.js`**

This is large. It holds the empty/normalize/load/save helpers from the original `server/json-store.js`, expanded for the new collections, and exposes a namespaced API (`store.users.add`, `store.virtualKeys.list`, etc.). All methods return promises.

```js
'use strict';

const fs = require('fs');
const path = require('path');

const COLLECTIONS = [
  'users', 'providerKeys', 'teams', 'virtualKeys',
  'agents', 'agentRuns', 'alerts', 'requests', 'auditLog',
];

const COUNTERS = [
  'nextUserId', 'nextKeyId', 'nextTeamId', 'nextVirtualKeyId',
  'nextAgentId', 'nextAgentRunId', 'nextAlertId', 'nextRequestId', 'nextAuditId',
];

function empty() {
  const out = {};
  for (const c of COUNTERS) out[c] = 1;
  for (const c of COLLECTIONS) out[c] = [];
  return out;
}

function normalize(d) {
  if (!d || typeof d !== 'object') return empty();
  const out = empty();
  for (const c of COLLECTIONS) {
    out[c] = Array.isArray(d[c]) ? d[c] : [];
  }
  // Counter values >= max(existing id) + 1
  const idMax = (rows) => rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  out.nextUserId        = Math.max(Number(d.nextUserId) || 0,        idMax(out.users))        + 1;
  out.nextKeyId         = Math.max(Number(d.nextKeyId) || 0,         idMax(out.providerKeys)) + 1;
  out.nextTeamId        = Math.max(Number(d.nextTeamId) || 0,        idMax(out.teams))        + 1;
  out.nextVirtualKeyId  = Math.max(Number(d.nextVirtualKeyId) || 0,  idMax(out.virtualKeys))  + 1;
  out.nextAgentId       = Math.max(Number(d.nextAgentId) || 0,       idMax(out.agents))       + 1;
  out.nextAgentRunId    = Math.max(Number(d.nextAgentRunId) || 0,    idMax(out.agentRuns))    + 1;
  out.nextAlertId       = Math.max(Number(d.nextAlertId) || 0,       idMax(out.alerts))       + 1;
  out.nextRequestId     = Math.max(Number(d.nextRequestId) || 0,     idMax(out.requests))     + 1;
  out.nextAuditId       = Math.max(Number(d.nextAuditId) || 0,       idMax(out.auditLog))     + 1;
  return out;
}

function load(filePath) {
  try {
    if (!fs.existsSync(filePath)) return empty();
    return normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return empty();
  }
}

function save(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Atomic-ish: write to tmp then rename so a crash mid-write can't corrupt.
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function nowIso() { return new Date().toISOString(); }

function createJsonStore(opts) {
  const filePath = opts.path;
  if (!filePath) throw new Error('json store requires { path }');
  let data = load(filePath);
  const persist = () => save(filePath, data);
  const wrap = (v) => Promise.resolve(v);

  return {
    kind: 'json',
    path: filePath,
    _raw: () => data,                     // tests + scripts only

    users: {
      all: () => wrap(data.users.slice()),
      add: ({ email, passwordHash }) => {
        const em = String(email).toLowerCase();
        if (data.users.some(u => u.email.toLowerCase() === em)) {
          const e = new Error('duplicate email');
          e.code = 'DUPLICATE_EMAIL';
          return Promise.reject(e);
        }
        const row = { id: data.nextUserId++, email: String(email), passwordHash, createdAt: nowIso() };
        data.users.push(row);
        persist();
        return wrap(row);
      },
      findByEmail: (email) => {
        const em = String(email).toLowerCase();
        return wrap(data.users.find(u => u.email.toLowerCase() === em) || null);
      },
      findById: (id) => wrap(data.users.find(u => String(u.id) === String(id)) || null),
      updatePassword: (id, passwordHash) => {
        const u = data.users.find(u => String(u.id) === String(id));
        if (!u) return wrap(false);
        u.passwordHash = passwordHash;
        persist();
        return wrap(true);
      },
    },

    providerKeys: {
      add: (userId, row) => {
        const r = { id: data.nextKeyId++, userId: Number(userId), createdAt: nowIso(), ...row };
        data.providerKeys.push(r);
        persist();
        return wrap(r);
      },
      list: (userId) => wrap(data.providerKeys
        .filter(k => String(k.userId) === String(userId))
        .sort((a, b) => b.id - a.id)),
      get: (userId, id) => wrap(data.providerKeys.find(
        k => String(k.userId) === String(userId) && k.id === Number(id)
      ) || null),
      delete: (userId, id) => {
        const i = data.providerKeys.findIndex(
          k => String(k.userId) === String(userId) && k.id === Number(id)
        );
        if (i === -1) return wrap(false);
        data.providerKeys.splice(i, 1);
        persist();
        return wrap(true);
      },
      latestForProvider: (userId, provider) => wrap(
        data.providerKeys
          .filter(k => String(k.userId) === String(userId) && k.provider === provider)
          .sort((a, b) => b.id - a.id)[0] || null
      ),
    },

    // Stubs filled in by later tasks; methods throw so callers fail loudly.
    teams: notImplemented('teams'),
    virtualKeys: notImplemented('virtualKeys'),
    agents: notImplemented('agents'),
    agentRuns: notImplemented('agentRuns'),
    alerts: notImplemented('alerts'),
    requests: notImplemented('requests'),
    auditLog: notImplemented('auditLog'),
  };
}

function notImplemented(name) {
  return new Proxy({}, {
    get(_t, prop) {
      return () => Promise.reject(new Error(`store.${name}.${String(prop)} not implemented`));
    },
  });
}

module.exports = { createJsonStore };
```

- [ ] **Step 6: Run the store test and verify it passes**

```bash
npm test -- store
```

Expected: PASS (3 tests).

- [ ] **Step 7: Migrate the legacy `server/json-store.js` callers**

`server/index.with-api.js` will be refactored in Task 3. For now keep `server/json-store.js` untouched so the old entry point still boots. Task 3 deletes it.

- [ ] **Step 8: Commit**

```bash
git add server/store/ test/server/store.test.js
git commit -m "feat(store): async storage interface with JSON adapter and Supabase stub"
```

---

### Task 3: Extract `createApp({ store })` factory

**Files:**
- Create: `server/app.js`
- Create: `server/lib/validate.js`
- Create: `server/lib/rate-limiters.js`
- Create: `server/lib/errors.js`
- Create: `server/routes/auth.js`
- Create: `server/routes/provider-keys.js`
- Create: `server/routes/proxy.js`
- Modify: `server/index.with-api.js` (becomes ~30 lines)
- Delete: `server/json-store.js`
- Test: `test/server/auth.test.js`, `test/server/provider-keys.test.js`

Goal: pull every route out of `index.with-api.js` into per-domain files, each exporting `function register(app, ctx)`. Behavior is identical to before; tests prove it.

- [ ] **Step 1: Write failing tests for auth**

```js
// test/server/auth.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

describe('auth', () => {
  it('signup → me → logout', async () => {
    const { app } = makeApp();
    const agent = request.agent(app);

    const signup = await agent.post('/api/auth/signup')
      .send({ email: 'a@b.com', password: 'longenough1' });
    expect(signup.status).toBe(201);
    expect(signup.body.user.email).toBe('a@b.com');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('a@b.com');

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);

    const me2 = await agent.get('/api/auth/me');
    expect(me2.status).toBe(401);
  });

  it('rejects duplicate email with 409', async () => {
    const { app } = makeApp();
    await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    const dup = await request(app).post('/api/auth/signup').send({ email: 'A@B.COM', password: 'longenough2' });
    expect(dup.status).toBe(409);
  });

  it('rejects bad password length', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- auth
```

Expected: FAIL — `server/app.js` does not exist.

- [ ] **Step 3: Create `server/lib/errors.js`**

```js
'use strict';

function jsonError(res, status, error, extra) {
  res.status(status).json({ error, ...(extra || {}) });
}

const CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
};

module.exports = { jsonError, CODES };
```

- [ ] **Step 4: Create `server/lib/validate.js`**

```js
'use strict';
const { jsonError, CODES } = require('./errors');

function validate(schema) {
  return (req, res, next) => {
    const out = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!out.success) {
      return jsonError(res, 400, 'Invalid request', {
        code: CODES.VALIDATION_ERROR,
        issues: out.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.validated = out.data;
    next();
  };
}

module.exports = { validate };
```

- [ ] **Step 5: Create `server/lib/rate-limiters.js`**

Move the existing `makeLimiter` factory and the four pre-configured limiters here. Disable in `NODE_ENV=test` so tests don't trip the limiters.

```js
'use strict';
const rateLimit = require('express-rate-limit');
const { jsonError, CODES } = require('./errors');

function makeLimiter({ windowMs, max, scope, byUser }) {
  if (process.env.NODE_ENV === 'test') {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs, max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const uid = byUser && req.user && req.user.id ? String(req.user.id) : '';
      return uid ? `${scope}:u:${uid}` : `${scope}:ip:${ip}`;
    },
    handler: (_req, res) => {
      const ra = Number(res.getHeader('Retry-After') || 0);
      jsonError(res, 429, 'Too many requests', {
        code: CODES.RATE_LIMITED,
        scope,
        retryAfterSeconds: ra || undefined,
      });
    },
  });
}

const apiLimiter        = makeLimiter({ windowMs: 60_000,         max: 120, scope: 'api',   byUser: false });
const authLimiter       = makeLimiter({ windowMs: 15 * 60_000,    max: 20,  scope: 'auth',  byUser: false });
const userWriteLimiter  = makeLimiter({ windowMs: 60_000,         max: 60,  scope: 'write', byUser: true  });
const proxyLimiter      = makeLimiter({ windowMs: 60_000,         max: 30,  scope: 'proxy', byUser: true  });
const ingestLimiter     = makeLimiter({ windowMs: 60_000,         max: 600, scope: 'ingest', byUser: true });

module.exports = { makeLimiter, apiLimiter, authLimiter, userWriteLimiter, proxyLimiter, ingestLimiter };
```

- [ ] **Step 6: Create `server/routes/auth.js`**

```js
'use strict';
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { authLimiter } = require('../lib/rate-limiters');
const { signSession, clearSession, readUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function register(app, { store }) {
  app.post(
    '/api/auth/signup',
    authLimiter,
    validate(z.object({
      body: z.object({
        email: z.string().min(3).max(254).transform(normalizeEmail),
        password: z.string().min(8).max(256),
      }).strict(),
    })),
    async (req, res) => {
      try {
        const { email, password } = req.validated.body;
        if (!email.includes('@')) return jsonError(res, 400, 'Invalid email');
        const passwordHash = bcrypt.hashSync(password, 12);
        let user;
        try {
          user = await store.users.add({ email, passwordHash });
        } catch (e) {
          if (e.code === 'DUPLICATE_EMAIL') return jsonError(res, 409, 'Email already registered');
          throw e;
        }
        signSession(res, { sub: String(user.id), email: user.email });
        res.status(201).json({ user: { id: user.id, email: user.email }, isNew: true });
      } catch (e) {
        console.error('[meridian] signup', e);
        jsonError(res, 500, 'Could not create account');
      }
    }
  );

  app.post(
    '/api/auth/login',
    authLimiter,
    validate(z.object({
      body: z.object({
        email: z.string().min(3).max(254).transform(normalizeEmail),
        password: z.string().min(1).max(256),
      }).strict(),
    })),
    async (req, res) => {
      try {
        const { email, password } = req.validated.body;
        const row = await store.users.findByEmail(email);
        if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
          return jsonError(res, 401, 'Invalid email or password');
        }
        signSession(res, { sub: String(row.id), email: row.email });
        res.json({ user: { id: row.id, email: row.email }, isNew: false });
      } catch (e) {
        console.error('[meridian] login', e);
        jsonError(res, 500, 'Could not sign in');
      }
    }
  );

  app.post('/api/auth/logout', (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = readUser(req);
    if (!user) return res.status(401).json({ user: null });
    const row = await store.users.findById(user.id);
    if (!row) {
      clearSession(res);
      return res.status(401).json({ user: null });
    }
    res.json({ user: { id: row.id, email: row.email } });
  });
}

module.exports = { register };
```

- [ ] **Step 7: Create `server/routes/provider-keys.js`**

Same structure — extract the existing routes and switch to async store calls. Full code:

```js
'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { encryptSecret } = require('../crypto-secret');
const { jsonError } = require('../lib/errors');

function safeText(s, max = 200) {
  return String(s || '').replace(/[ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function maskKey(secret) {
  const s = String(secret || '').replace(/\s+/g, '');
  if (s.length <= 8) return '••••';
  return s.slice(0, 4) + '···' + s.slice(-4);
}

function register(app, { store }) {
  app.get('/api/provider-keys', requireUser, async (req, res) => {
    const rows = await store.providerKeys.list(req.user.id);
    res.json({
      keys: rows.map(r => ({
        id: r.id, provider: r.provider, label: r.label || '', createdAt: r.createdAt, mask: r.mask || 'stored···',
      })),
    });
  });

  app.post(
    '/api/provider-keys',
    requireUser,
    userWriteLimiter,
    validate(z.object({
      body: z.object({
        provider: z.enum(['anthropic', 'openai', 'google', 'mistral']),
        apiKey: z.string().min(8).max(2000).transform(s => String(s).trim()),
        label: z.string().optional().transform(v => safeText(v, 200)),
      }).strict(),
    })),
    async (req, res) => {
      const { provider, apiKey, label } = req.validated.body;
      if (/[\r\n\t]/.test(apiKey)) return jsonError(res, 400, 'Invalid apiKey', { code: 'VALIDATION_ERROR' });
      const enc = encryptSecret(apiKey);
      const row = await store.providerKeys.add(req.user.id, {
        provider, label: label || null, mask: maskKey(apiKey),
        iv: enc.iv, ciphertext: enc.ciphertext, authTag: enc.authTag,
      });
      res.status(201).json({ key: { id: row.id, provider, label, mask: row.mask } });
    }
  );

  app.delete(
    '/api/provider-keys/:id',
    requireUser,
    userWriteLimiter,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      const ok = await store.providerKeys.delete(req.user.id, req.validated.params.id);
      if (!ok) return jsonError(res, 404, 'Not found');
      res.json({ ok: true });
    }
  );
}

module.exports = { register };
```

- [ ] **Step 8: Create `server/routes/proxy.js`**

Identical to the existing proxy block, but reading `apiKey` via the store. Trimmed for brevity here — copy the two `app.post` calls from `server/index.with-api.js:281-361` verbatim, swap `getDecryptedKey(req.user.id, 'anthropic')` for `await getDecryptedKey(store, req.user.id, 'anthropic')`, and define:

```js
const { decryptSecret } = require('../crypto-secret');
async function getDecryptedKey(store, userId, provider) {
  const row = await store.providerKeys.latestForProvider(userId, provider);
  if (!row) return null;
  return decryptSecret({ iv: row.iv, ciphertext: row.ciphertext, authTag: row.authTag });
}
```

- [ ] **Step 9: Create `server/app.js`**

```js
'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const { readUser } = require('./auth-middleware');
const { apiLimiter } = require('./lib/rate-limiters');
const { jsonError } = require('./lib/errors');

const authRoutes         = require('./routes/auth');
const providerKeysRoutes = require('./routes/provider-keys');
const proxyRoutes        = require('./routes/proxy');

function createApp({ store }) {
  if (!store) throw new Error('createApp requires { store }');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.NODE_ENV === 'production');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '256kb', strict: true, type: ['application/json', 'application/*+json'] }));
  app.use(cookieParser());

  app.use((req, _res, next) => { req.user = readUser(req); next(); });

  app.use('/api', apiLimiter);

  const ctx = { store };
  authRoutes.register(app, ctx);
  providerKeysRoutes.register(app, ctx);
  proxyRoutes.register(app, ctx);
  // Later tasks register more routes here:
  //   teams, virtualKeys, agents, alerts, requests, kpi, auditLog

  // 404 fallthrough for /api/* must be JSON, not the static file 404 page.
  app.use('/api', (_req, res) => jsonError(res, 404, 'Not found', { code: 'NOT_FOUND' }));

  // Static UI is mounted by the entrypoint, not here, so tests don't depend on /Meridian.html.

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 10: Slim `server/index.with-api.js`**

Replace its contents with:

```js
'use strict';
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Set JWT_SECRET and ENCRYPTION_KEY in .env (see .env.example)');
    process.exit(1);
  }
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  console.warn('[meridian] Dev mode: ephemeral JWT_SECRET + ENCRYPTION_KEY (set them in .env to persist).');
}

const express = require('express');
const { createStore } = require('./store');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5500;
const ROOT = path.join(__dirname, '..');
const STORE_PATH = process.env.MERIDIAN_STORE_PATH || path.join(ROOT, 'data', 'meridian-store.json');

const store = createStore({ kind: 'json', path: STORE_PATH });
const app = createApp({ store });

app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'Meridian.html')));

app.listen(PORT, () => {
  console.log(`Meridian server http://localhost:${PORT}`);
  console.log(`JSON store: ${STORE_PATH}`);
});
```

- [ ] **Step 11: Delete legacy `server/json-store.js`**

```bash
git rm server/json-store.js
```

- [ ] **Step 12: Run all tests**

```bash
npm test
```

Expected: PASS — smoke + store + auth + (Task 4 will add provider-keys.test.js).

- [ ] **Step 13: Write provider-keys test**

```js
// test/server/provider-keys.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

async function signup(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  return agent;
}

describe('provider-keys', () => {
  it('add → list → delete', async () => {
    const { app } = makeApp();
    const agent = await signup(app);

    const add = await agent.post('/api/provider-keys')
      .send({ provider: 'anthropic', apiKey: 'sk-ant-test-1234567890', label: 'main' });
    expect(add.status).toBe(201);
    expect(add.body.key.mask).toMatch(/sk-a···7890/);
    const id = add.body.key.id;

    const list = await agent.get('/api/provider-keys');
    expect(list.body.keys).toHaveLength(1);

    const del = await agent.delete(`/api/provider-keys/${id}`);
    expect(del.status).toBe(200);

    const list2 = await agent.get('/api/provider-keys');
    expect(list2.body.keys).toHaveLength(0);
  });

  it('rejects unauthenticated request', async () => {
    const { app } = makeApp();
    const r = await request(app).get('/api/provider-keys');
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 14: Run, expect pass, commit**

```bash
npm test
git add server/ test/
git commit -m "refactor(server): extract createApp factory and per-domain route files"
```

---

### Task 4: Audit log service

**Files:**
- Create: `server/services/audit-log.js`
- Create: `server/routes/audit-log.js`
- Modify: `server/store/json.js` (implement `auditLog`)
- Modify: `server/app.js` (register route)
- Modify: `server/routes/auth.js` + `server/routes/provider-keys.js` (emit events)
- Test: `test/services/audit-log.test.js`, `test/server/audit-log.test.js`

- [ ] **Step 1: Implement `store.auditLog` in `server/store/json.js`**

Replace the `auditLog: notImplemented('auditLog')` line with:

```js
auditLog: {
  append: ({ userId, action, target, meta, ip }) => {
    const row = {
      id: data.nextAuditId++,
      userId: userId == null ? null : Number(userId),
      action: String(action),
      target: target || null,
      meta: meta || null,
      ip: ip || null,
      timestamp: nowIso(),
    };
    data.auditLog.push(row);
    persist();
    return wrap(row);
  },
  list: ({ userId, limit = 100 } = {}) => wrap(
    data.auditLog
      .filter(r => userId == null || String(r.userId) === String(userId))
      .sort((a, b) => b.id - a.id)
      .slice(0, Math.max(1, Math.min(1000, Number(limit) || 100)))
  ),
},
```

- [ ] **Step 2: Write the failing service test**

```js
// test/services/audit-log.test.js
'use strict';
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');
const { createAuditLog } = require('../../server/services/audit-log');

describe('audit log service', () => {
  it('appends and lists', async () => {
    const { store } = makeApp();
    const audit = createAuditLog({ store });
    await audit.append({ userId: 1, action: 'auth.login', ip: '1.2.3.4' });
    await audit.append({ userId: 1, action: 'provider_key.add', target: { id: 9 } });
    const rows = await audit.list({ userId: 1 });
    expect(rows).toHaveLength(2);
    expect(rows[0].action).toBe('provider_key.add');
  });

  it('redacts unknown fields and never logs apiKey', async () => {
    const { store } = makeApp();
    const audit = createAuditLog({ store });
    await audit.append({ userId: 1, action: 'provider_key.add', meta: { apiKey: 'sk-secret', label: 'ok' } });
    const [row] = await audit.list({ userId: 1 });
    expect(row.meta.apiKey).toBeUndefined();
    expect(row.meta.label).toBe('ok');
  });
});
```

- [ ] **Step 3: Run test, expect failure**

```bash
npm test -- audit-log
```

- [ ] **Step 4: Implement `server/services/audit-log.js`**

```js
'use strict';

const REDACTED_KEYS = new Set(['apiKey', 'password', 'passwordHash', 'token', 'secret', 'cookie']);

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(k)) continue;
    out[k] = typeof v === 'object' ? sanitizeMeta(v) : v;
  }
  return out;
}

function ipFromReq(req) {
  if (!req) return null;
  return req.ip || req.connection?.remoteAddress || null;
}

function createAuditLog({ store }) {
  return {
    append: async ({ userId, action, target, meta, ip, req }) => {
      const safeMeta = sanitizeMeta(meta);
      return store.auditLog.append({
        userId, action, target: target || null,
        meta: safeMeta, ip: ip || ipFromReq(req),
      });
    },
    list: ({ userId, limit } = {}) => store.auditLog.list({ userId, limit }),
  };
}

module.exports = { createAuditLog };
```

- [ ] **Step 5: Run test, expect pass**

- [ ] **Step 6: Wire audit events into auth + provider-keys**

In `server/app.js`, after `const ctx = { store };`:

```js
const { createAuditLog } = require('./services/audit-log');
ctx.audit = createAuditLog({ store });
```

In `server/routes/auth.js`, append after `signSession(...)` in signup, login, and after `clearSession` in logout:

```js
// signup:
ctx.audit.append({ userId: user.id, action: 'auth.signup', req });
// login:
ctx.audit.append({ userId: row.id, action: 'auth.login', req });
// logout:
ctx.audit.append({ userId: req.user?.id || null, action: 'auth.logout', req });
```

(Pass `ctx` into each `register(app, ctx)`; the routes already accept it.)

In `server/routes/provider-keys.js`, after add and delete success:

```js
ctx.audit.append({ userId: req.user.id, action: 'provider_key.add', target: { id: row.id }, meta: { provider, label }, req });
ctx.audit.append({ userId: req.user.id, action: 'provider_key.delete', target: { id: Number(req.validated.params.id) }, req });
```

- [ ] **Step 7: Add `server/routes/audit-log.js`**

```js
'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { requireUser } = require('../auth-middleware');

function register(app, { store }) {
  app.get(
    '/api/audit-log',
    requireUser,
    validate(z.object({
      query: z.object({ limit: z.string().regex(/^\d+$/).optional() }).strict(),
    })),
    async (req, res) => {
      const limit = req.validated.query.limit ? Number(req.validated.query.limit) : 100;
      const rows = await store.auditLog.list({ userId: req.user.id, limit });
      res.json({ entries: rows });
    }
  );
}

module.exports = { register };
```

Register in `server/app.js` next to the others.

- [ ] **Step 8: HTTP test**

```js
// test/server/audit-log.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

describe('audit log endpoint', () => {
  it('lists the current user’s events only', async () => {
    const { app } = makeApp();
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });

    const list = await a.get('/api/audit-log');
    expect(list.status).toBe(200);
    expect(list.body.entries.some(e => e.action === 'auth.signup')).toBe(true);
  });
});
```

- [ ] **Step 9: Run all tests, expect pass, commit**

```bash
npm test
git add server/ test/
git commit -m "feat(audit): persistent audit log with auth + provider-key events"
```

---

### Task 5: Teams CRUD

**Files:**
- Modify: `server/store/json.js` (implement `teams`)
- Create: `server/routes/teams.js`
- Modify: `server/app.js` (register)
- Test: `test/server/teams.test.js`

Schema (per the store schema section): `{ id, userId, name, monthlyBudgetUsd, createdAt }`.

- [ ] **Step 1: Implement `store.teams`**

Replace `teams: notImplemented('teams')` with:

```js
teams: {
  list: (userId) => wrap(
    data.teams.filter(t => String(t.userId) === String(userId)).sort((a, b) => a.id - b.id)
  ),
  get: (userId, id) => wrap(
    data.teams.find(t => String(t.userId) === String(userId) && t.id === Number(id)) || null
  ),
  add: (userId, { name, monthlyBudgetUsd }) => {
    const row = {
      id: data.nextTeamId++, userId: Number(userId),
      name: String(name), monthlyBudgetUsd: monthlyBudgetUsd == null ? null : Number(monthlyBudgetUsd),
      createdAt: nowIso(),
    };
    data.teams.push(row);
    persist();
    return wrap(row);
  },
  update: (userId, id, patch) => {
    const t = data.teams.find(t => String(t.userId) === String(userId) && t.id === Number(id));
    if (!t) return wrap(null);
    if ('name' in patch) t.name = String(patch.name);
    if ('monthlyBudgetUsd' in patch) t.monthlyBudgetUsd = patch.monthlyBudgetUsd == null ? null : Number(patch.monthlyBudgetUsd);
    persist();
    return wrap(t);
  },
  delete: (userId, id) => {
    const i = data.teams.findIndex(t => String(t.userId) === String(userId) && t.id === Number(id));
    if (i === -1) return wrap(false);
    data.teams.splice(i, 1);
    persist();
    return wrap(true);
  },
},
```

- [ ] **Step 2: Write failing HTTP test**

```js
// test/server/teams.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

async function signin(app) {
  const a = request.agent(app);
  await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  return a;
}

describe('teams', () => {
  it('CRUD round-trip', async () => {
    const { app } = makeApp();
    const a = await signin(app);

    const create = await a.post('/api/teams').send({ name: 'Engineering', monthlyBudgetUsd: 1500 });
    expect(create.status).toBe(201);
    const id = create.body.team.id;

    const list = await a.get('/api/teams');
    expect(list.body.teams).toHaveLength(1);

    const update = await a.put(`/api/teams/${id}`).send({ monthlyBudgetUsd: 2000 });
    expect(update.body.team.monthlyBudgetUsd).toBe(2000);

    const del = await a.delete(`/api/teams/${id}`);
    expect(del.status).toBe(200);

    const list2 = await a.get('/api/teams');
    expect(list2.body.teams).toHaveLength(0);
  });

  it('rejects negative budget', async () => {
    const { app } = makeApp();
    const a = await signin(app);
    const r = await a.post('/api/teams').send({ name: 'X', monthlyBudgetUsd: -1 });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run, expect failure**

- [ ] **Step 4: Create `server/routes/teams.js`**

```js
'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');

const teamBody = z.object({
  name: z.string().min(1).max(80),
  monthlyBudgetUsd: z.number().nonnegative().nullable().optional(),
}).strict();

const teamPatch = z.object({
  name: z.string().min(1).max(80).optional(),
  monthlyBudgetUsd: z.number().nonnegative().nullable().optional(),
}).strict();

function register(app, { store, audit }) {
  app.get('/api/teams', requireUser, async (req, res) => {
    const teams = await store.teams.list(req.user.id);
    res.json({ teams });
  });

  app.post('/api/teams', requireUser, userWriteLimiter,
    validate(z.object({ body: teamBody })),
    async (req, res) => {
      const team = await store.teams.add(req.user.id, req.validated.body);
      audit.append({ userId: req.user.id, action: 'team.create', target: { id: team.id }, req });
      res.status(201).json({ team });
    }
  );

  app.put('/api/teams/:id', requireUser, userWriteLimiter,
    validate(z.object({
      params: z.object({ id: z.string().regex(/^\d+$/) }).strict(),
      body: teamPatch,
    })),
    async (req, res) => {
      const team = await store.teams.update(req.user.id, req.validated.params.id, req.validated.body);
      if (!team) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'team.update', target: { id: team.id }, req });
      res.json({ team });
    }
  );

  app.delete('/api/teams/:id', requireUser, userWriteLimiter,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      const ok = await store.teams.delete(req.user.id, req.validated.params.id);
      if (!ok) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'team.delete', target: { id: Number(req.validated.params.id) }, req });
      res.json({ ok: true });
    }
  );
}

module.exports = { register };
```

- [ ] **Step 5: Register in `server/app.js`**

Add to the route block:

```js
require('./routes/teams').register(app, ctx);
```

Make sure `ctx.audit` is set before this line (Task 4 step 6).

- [ ] **Step 6: Run, expect pass, commit**

```bash
npm test
git add server/ test/
git commit -m "feat(teams): CRUD endpoints with monthly budget + audit"
```

---

### Task 6: Pricing service

**Files:**
- Create: `server/services/pricing.js`
- Test: `test/services/pricing.test.js`

The pricing table from the architecture section, plus `costFor()`.

- [ ] **Step 1: Write failing test**

```js
// test/services/pricing.test.js
'use strict';
const { describe, it, expect } = require('vitest');
const { costFor, listModels } = require('../../server/services/pricing');

describe('pricing.costFor', () => {
  it('computes anthropic claude-haiku-4-5 cost', () => {
    // 1000 input + 2000 output tokens, prices: 1.00 input / 5.00 output per 1M
    const c = costFor({ provider: 'anthropic', model: 'claude-haiku-4-5', promptTokens: 1000, completionTokens: 2000 });
    expect(c).toBeCloseTo((1000 * 1 + 2000 * 5) / 1_000_000, 6);
    // = (1000 + 10000) / 1e6 = 0.011
    expect(c).toBeCloseTo(0.011, 6);
  });

  it('returns 0 and logs for unknown model', () => {
    const c = costFor({ provider: 'anthropic', model: 'made-up', promptTokens: 100, completionTokens: 100 });
    expect(c).toBe(0);
  });

  it('rejects negative tokens', () => {
    expect(() => costFor({ provider: 'anthropic', model: 'claude-haiku-4-5', promptTokens: -1, completionTokens: 0 }))
      .toThrow(/tokens/);
  });

  it('listModels returns at least 9 models', () => {
    expect(listModels().length).toBeGreaterThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `server/services/pricing.js`**

```js
'use strict';

// USD per 1M tokens.
const TABLE = {
  anthropic: {
    'claude-opus-4-7':   { input: 15.00, output: 75.00 },
    'claude-sonnet-4-6': { input:  3.00, output: 15.00 },
    'claude-haiku-4-5':  { input:  1.00, output:  5.00 },
  },
  openai: {
    'gpt-4.1':       { input: 3.00, output: 12.00 },
    'gpt-4.1-mini':  { input: 0.40, output:  1.60 },
    'gpt-4.1-nano':  { input: 0.10, output:  0.40 },
  },
  google: {
    'gemini-2.5-pro':   { input: 1.25, output: 5.00 },
    'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  },
  mistral: {
    'mistral-large-2': { input: 2.00, output: 6.00 },
  },
};

function costFor({ provider, model, promptTokens = 0, completionTokens = 0 }) {
  if (promptTokens < 0 || completionTokens < 0) {
    throw new Error('costFor: tokens must be non-negative');
  }
  const row = TABLE[provider]?.[model];
  if (!row) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[meridian] pricing: unknown ${provider}/${model}; cost=0`);
    }
    return 0;
  }
  return (promptTokens * row.input + completionTokens * row.output) / 1_000_000;
}

function listModels() {
  const out = [];
  for (const [provider, models] of Object.entries(TABLE)) {
    for (const [model, prices] of Object.entries(models)) {
      out.push({ provider, model, ...prices });
    }
  }
  return out;
}

module.exports = { costFor, listModels, TABLE };
```

- [ ] **Step 4: Run, expect pass, commit**

```bash
npm test -- pricing
git add server/services/pricing.js test/services/pricing.test.js
git commit -m "feat(pricing): per-model token pricing service"
```

---

### Task 7: Virtual keys (with secret hashing)

**Files:**
- Modify: `server/store/json.js` (implement `virtualKeys`)
- Create: `server/routes/virtual-keys.js`
- Modify: `server/app.js` (register)
- Test: `test/server/virtual-keys.test.js`

Virtual keys grant clients access to ingestion. The full secret is shown to the user **once** at creation; we store only `prefix` (for display) and `keyHash` (bcrypt).

Generated key format: `mk_<22 base62 chars>` (≈131 bits entropy). Prefix shown in UI = first 9 chars (`mk_` + 6 base62, e.g. `mk_xxxxxx`).

- [ ] **Step 1: Implement `store.virtualKeys`**

Replace `virtualKeys: notImplemented('virtualKeys')` with:

```js
virtualKeys: {
  list: (userId) => wrap(
    data.virtualKeys
      .filter(k => String(k.userId) === String(userId))
      .map(k => ({ ...k }))             // shallow copy; keyHash is included for internal use
      .sort((a, b) => b.id - a.id)
  ),
  get: (userId, id) => wrap(
    data.virtualKeys.find(k => String(k.userId) === String(userId) && k.id === Number(id)) || null
  ),
  add: (userId, row) => {
    const r = {
      id: data.nextVirtualKeyId++, userId: Number(userId),
      teamId: row.teamId == null ? null : Number(row.teamId),
      providerKeyId: Number(row.providerKeyId),
      label: String(row.label || ''),
      prefix: String(row.prefix),
      keyHash: String(row.keyHash),
      monthlyBudgetUsd: row.monthlyBudgetUsd == null ? null : Number(row.monthlyBudgetUsd),
      status: 'active',
      spentMtdUsd: 0,
      lastUsedAt: null,
      createdAt: nowIso(),
    };
    data.virtualKeys.push(r);
    persist();
    return wrap(r);
  },
  update: (userId, id, patch) => {
    const k = data.virtualKeys.find(k => String(k.userId) === String(userId) && k.id === Number(id));
    if (!k) return wrap(null);
    for (const f of ['label', 'status', 'teamId', 'monthlyBudgetUsd']) {
      if (f in patch) k[f] = patch[f];
    }
    persist();
    return wrap(k);
  },
  delete: (userId, id) => {
    const i = data.virtualKeys.findIndex(k => String(k.userId) === String(userId) && k.id === Number(id));
    if (i === -1) return wrap(false);
    data.virtualKeys.splice(i, 1);
    persist();
    return wrap(true);
  },
  // Used by ingestion: looks up by prefix, then bcrypt-compares the rest.
  findByPrefix: (prefix) => wrap(
    data.virtualKeys.filter(k => k.prefix === prefix && k.status === 'active')
  ),
  recordSpend: (id, deltaUsd) => {
    const k = data.virtualKeys.find(k => k.id === Number(id));
    if (!k) return wrap(null);
    k.spentMtdUsd = Number((k.spentMtdUsd || 0) + Number(deltaUsd || 0));
    k.lastUsedAt = nowIso();
    persist();
    return wrap(k);
  },
  resetMtd: () => {
    for (const k of data.virtualKeys) k.spentMtdUsd = 0;
    persist();
    return wrap(true);
  },
},
```

- [ ] **Step 2: Write failing HTTP test**

```js
// test/server/virtual-keys.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

async function setup(app) {
  const a = request.agent(app);
  await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  const provider = await a.post('/api/provider-keys')
    .send({ provider: 'openai', apiKey: 'sk-1234567890', label: 'main' });
  const team = await a.post('/api/teams').send({ name: 'Eng', monthlyBudgetUsd: 1000 });
  return { agent: a, providerKeyId: provider.body.key.id, teamId: team.body.team.id };
}

describe('virtual-keys', () => {
  it('issues a one-time secret and stores only the hash', async () => {
    const { app, store } = makeApp();
    const { agent, providerKeyId, teamId } = await setup(app);

    const r = await agent.post('/api/virtual-keys')
      .send({ providerKeyId, teamId, label: 'frontend', monthlyBudgetUsd: 100 });
    expect(r.status).toBe(201);
    expect(r.body.secret).toMatch(/^mk_[A-Za-z0-9]{22}$/);
    expect(r.body.key.prefix).toMatch(/^mk_[A-Za-z0-9]{6}$/);

    // Verify store has hash, not plaintext
    const raw = store._raw().virtualKeys[0];
    expect(raw.keyHash).toBeTruthy();
    expect(raw.keyHash).not.toBe(r.body.secret);
  });

  it('list does not return the secret', async () => {
    const { app } = makeApp();
    const { agent, providerKeyId, teamId } = await setup(app);
    await agent.post('/api/virtual-keys').send({ providerKeyId, teamId, label: 'x' });
    const list = await agent.get('/api/virtual-keys');
    for (const k of list.body.keys) expect(k.secret).toBeUndefined();
    expect(list.body.keys[0].prefix).toMatch(/^mk_/);
  });
});
```

- [ ] **Step 3: Run, expect failure**

- [ ] **Step 4: Implement `server/routes/virtual-keys.js`**

```js
'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateSecret() {
  const bytes = crypto.randomBytes(22);
  let out = '';
  for (let i = 0; i < 22; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `mk_${out}`;
}

function publicShape(k) {
  return {
    id: k.id,
    prefix: k.prefix,
    label: k.label,
    teamId: k.teamId,
    providerKeyId: k.providerKeyId,
    status: k.status,
    monthlyBudgetUsd: k.monthlyBudgetUsd,
    spentMtdUsd: k.spentMtdUsd,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
  };
}

const createBody = z.object({
  providerKeyId: z.number().int().positive(),
  teamId: z.number().int().positive().nullable().optional(),
  label: z.string().min(1).max(80),
  monthlyBudgetUsd: z.number().nonnegative().nullable().optional(),
}).strict();

const patchBody = z.object({
  label: z.string().min(1).max(80).optional(),
  status: z.enum(['active', 'paused', 'revoked']).optional(),
  teamId: z.number().int().positive().nullable().optional(),
  monthlyBudgetUsd: z.number().nonnegative().nullable().optional(),
}).strict();

function register(app, { store, audit }) {
  app.get('/api/virtual-keys', requireUser, async (req, res) => {
    const keys = (await store.virtualKeys.list(req.user.id)).map(publicShape);
    res.json({ keys });
  });

  app.post('/api/virtual-keys', requireUser, userWriteLimiter,
    validate(z.object({ body: createBody })),
    async (req, res) => {
      const { providerKeyId, teamId, label, monthlyBudgetUsd } = req.validated.body;
      const provider = await store.providerKeys.get(req.user.id, providerKeyId);
      if (!provider) return jsonError(res, 400, 'providerKeyId not found');
      if (teamId != null) {
        const team = await store.teams.get(req.user.id, teamId);
        if (!team) return jsonError(res, 400, 'teamId not found');
      }
      const secret = generateSecret();
      const prefix = secret.slice(0, 9);                   // "mk_" + 6 chars
      const keyHash = bcrypt.hashSync(secret, 10);
      const row = await store.virtualKeys.add(req.user.id, {
        providerKeyId, teamId, label, monthlyBudgetUsd,
        prefix, keyHash,
      });
      audit.append({ userId: req.user.id, action: 'virtual_key.create', target: { id: row.id }, meta: { label }, req });
      res.status(201).json({ key: publicShape(row), secret });
    }
  );

  app.put('/api/virtual-keys/:id', requireUser, userWriteLimiter,
    validate(z.object({
      params: z.object({ id: z.string().regex(/^\d+$/) }).strict(),
      body: patchBody,
    })),
    async (req, res) => {
      const k = await store.virtualKeys.update(req.user.id, req.validated.params.id, req.validated.body);
      if (!k) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'virtual_key.update', target: { id: k.id }, req });
      res.json({ key: publicShape(k) });
    }
  );

  app.delete('/api/virtual-keys/:id', requireUser, userWriteLimiter,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      const ok = await store.virtualKeys.delete(req.user.id, req.validated.params.id);
      if (!ok) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'virtual_key.delete', target: { id: Number(req.validated.params.id) }, req });
      res.json({ ok: true });
    }
  );
}

module.exports = { register, generateSecret, publicShape };
```

- [ ] **Step 5: Register in `server/app.js`, run tests, expect pass, commit**

```bash
npm test
git add server/ test/
git commit -m "feat(virtual-keys): one-time secret issuance with bcrypt-hashed storage"
```

---

### Task 8: Budget engine

**Files:**
- Create: `server/services/budget-engine.js`
- Test: `test/services/budget-engine.test.js`

The budget engine answers: "Has this virtual key (or its team) blown the monthly budget?" and records the spend after a request is appended.

In MVP, budgets are **advisory** — the engine returns `{ overBudget: bool, severity: 'ok' | 'warn' | 'over' }`. The route uses this to mark the request and trigger alerts but does not refuse the request.

- [ ] **Step 1: Write failing test**

```js
// test/services/budget-engine.test.js
'use strict';
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');
const { createBudgetEngine } = require('../../server/services/budget-engine');

async function seed() {
  const { store } = makeApp();
  const u = await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
  const team = await store.teams.add(u.id, { name: 'T', monthlyBudgetUsd: 100 });
  // Provider key dummy fields are fine here; nothing decrypts in this test.
  const pk = await store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'sk-x', iv: 'a', ciphertext: 'b', authTag: 'c' });
  const vk = await store.virtualKeys.add(u.id, {
    providerKeyId: pk.id, teamId: team.id, label: 'x',
    prefix: 'mk_aaaaaa', keyHash: 'hash', monthlyBudgetUsd: 50,
  });
  return { store, u, team, vk };
}

describe('budget engine', () => {
  it('classifies spend levels', async () => {
    const { store, u, vk } = await seed();
    const eng = createBudgetEngine({ store });

    const a = await eng.classify({ userId: u.id, virtualKeyId: vk.id, addUsd: 10 });
    expect(a.severity).toBe('ok');

    await store.virtualKeys.recordSpend(vk.id, 40);             // 40/50 spent
    const b = await eng.classify({ userId: u.id, virtualKeyId: vk.id, addUsd: 5 });    // 45/50 -> warn band starts at 80%
    expect(b.severity).toBe('warn');

    await store.virtualKeys.recordSpend(vk.id, 10);             // 50/50
    const c = await eng.classify({ userId: u.id, virtualKeyId: vk.id, addUsd: 1 });    // 51/50 -> over
    expect(c.severity).toBe('over');
  });

  it('aggregates team spend across keys', async () => {
    const { store, u, team } = await seed();
    const eng = createBudgetEngine({ store });
    // Two virtual keys on same team, no per-key budget
    const pk2 = await store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'x', iv: 'a', ciphertext: 'b', authTag: 'c' });
    const k2 = await store.virtualKeys.add(u.id, { providerKeyId: pk2.id, teamId: team.id, label: 'y', prefix: 'mk_bbbbbb', keyHash: 'h', monthlyBudgetUsd: null });
    await store.virtualKeys.recordSpend(k2.id, 99);
    const r = await eng.classify({ userId: u.id, virtualKeyId: k2.id, addUsd: 2 });    // team has 99 + 2 = 101 / 100 -> over
    expect(r.severity).toBe('over');
    expect(r.scope).toBe('team');
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `server/services/budget-engine.js`**

The route always knows `userId` at call time (request ingestion authenticates by virtual key, which carries `userId`), so `classify` requires it.

```js
'use strict';

const WARN_FRACTION = 0.8;

function severity(actual, limit) {
  if (limit == null) return 'ok';
  if (actual >= limit) return 'over';
  if (actual >= limit * WARN_FRACTION) return 'warn';
  return 'ok';
}

function createBudgetEngine({ store }) {
  return {
    classify: async ({ userId, virtualKeyId, addUsd }) => {
      const vk = await store.virtualKeys.get(userId, virtualKeyId);
      if (!vk) return { severity: 'ok', scope: 'unknown' };

      const keyAfter = (vk.spentMtdUsd || 0) + addUsd;
      const keySev = severity(keyAfter, vk.monthlyBudgetUsd);

      let teamSev = 'ok';
      if (vk.teamId != null) {
        const team = await store.teams.get(userId, vk.teamId);
        if (team && team.monthlyBudgetUsd != null) {
          const teamKeys = (await store.virtualKeys.list(userId)).filter(k => k.teamId === vk.teamId);
          const teamSpent = teamKeys.reduce((s, k) => s + (k.spentMtdUsd || 0), 0) + addUsd;
          teamSev = severity(teamSpent, team.monthlyBudgetUsd);
        }
      }

      // Worst severity wins; team trumps key when equal.
      const order = { ok: 0, warn: 1, over: 2 };
      const winner = order[teamSev] >= order[keySev] ? 'team' : 'key';
      return { severity: order[teamSev] >= order[keySev] ? teamSev : keySev, scope: winner };
    },

    recordSpend: ({ virtualKeyId, addUsd }) => store.virtualKeys.recordSpend(virtualKeyId, addUsd),
  };
}

module.exports = { createBudgetEngine };
```

- [ ] **Step 4: Run, expect pass, commit**

```bash
npm test -- budget-engine
git add server/services/budget-engine.js test/services/budget-engine.test.js
git commit -m "feat(budget): per-key and per-team budget classifier"
```

---

### Task 9: Request ingestion endpoint

**Files:**
- Modify: `server/store/json.js` (implement `requests`)
- Create: `server/routes/requests.js`
- Modify: `server/app.js` (register, plus middleware that auths via virtual key)
- Test: `test/server/requests.test.js`

This is the most important new endpoint. `POST /api/v1/requests` is called by an SDK / proxy / test harness for every LLM call the user makes. The route:

1. Reads `X-Meridian-Key` header.
2. Looks up by prefix, bcrypt-compares, sets `req.user` if valid.
3. Validates body.
4. Computes cost via pricing service.
5. Calls budget engine to classify (informational).
6. Appends to `requests` table.
7. Records spend on the virtual key.
8. Appends audit entry (`request.ingest`).
9. Returns `{ id, costUsd, severity }`.

- [ ] **Step 1: Implement `store.requests`**

Replace `requests: notImplemented('requests')` with:

```js
requests: {
  add: (row) => {
    const r = {
      id: data.nextRequestId++,
      userId: Number(row.userId),
      virtualKeyId: Number(row.virtualKeyId),
      teamId: row.teamId == null ? null : Number(row.teamId),
      agentId: row.agentId == null ? null : Number(row.agentId),
      provider: String(row.provider),
      model: String(row.model),
      promptTokens: Number(row.promptTokens || 0),
      completionTokens: Number(row.completionTokens || 0),
      latencyMs: Number(row.latencyMs || 0),
      costUsd: Number(row.costUsd || 0),
      status: String(row.status || 'ok'),
      taskType: row.taskType ? String(row.taskType) : null,
      timestamp: row.timestamp || nowIso(),
    };
    data.requests.push(r);
    persist();
    return wrap(r);
  },
  query: ({ userId, from, to, teamId, virtualKeyId, agentId, status, page = 1, limit = 50 }) => {
    let rows = data.requests.filter(r => String(r.userId) === String(userId));
    if (from)         rows = rows.filter(r => r.timestamp >= from);
    if (to)           rows = rows.filter(r => r.timestamp <= to);
    if (teamId)       rows = rows.filter(r => String(r.teamId) === String(teamId));
    if (virtualKeyId) rows = rows.filter(r => String(r.virtualKeyId) === String(virtualKeyId));
    if (agentId)      rows = rows.filter(r => String(r.agentId) === String(agentId));
    if (status)       rows = rows.filter(r => r.status === status);
    rows.sort((a, b) => b.id - a.id);
    const lim = Math.max(1, Math.min(500, Number(limit) || 50));
    const pg  = Math.max(1, Number(page) || 1);
    const total = rows.length;
    const slice = rows.slice((pg - 1) * lim, pg * lim);
    return wrap({ rows: slice, page: pg, limit: lim, total });
  },
  recentForKey: (userId, virtualKeyId, since) => wrap(
    data.requests.filter(r =>
      String(r.userId) === String(userId) &&
      String(r.virtualKeyId) === String(virtualKeyId) &&
      r.timestamp >= since
    )
  ),
  countSince: (userId, since) => wrap(
    data.requests.filter(r => String(r.userId) === String(userId) && r.timestamp >= since).length
  ),
  totalsSince: (userId, since) => {
    const rows = data.requests.filter(r => String(r.userId) === String(userId) && r.timestamp >= since);
    const tot = { count: rows.length, costUsd: 0, promptTokens: 0, completionTokens: 0 };
    for (const r of rows) {
      tot.costUsd += r.costUsd || 0;
      tot.promptTokens += r.promptTokens || 0;
      tot.completionTokens += r.completionTokens || 0;
    }
    return wrap(tot);
  },
},
```

- [ ] **Step 2: Write failing HTTP test**

```js
// test/server/requests.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

async function seed() {
  const ctx = makeApp();
  const a = request.agent(ctx.app);
  await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  const pk = await a.post('/api/provider-keys').send({ provider: 'openai', apiKey: 'sk-1234567890', label: '' });
  const tm = await a.post('/api/teams').send({ name: 'T', monthlyBudgetUsd: 1000 });
  const vk = await a.post('/api/virtual-keys').send({
    providerKeyId: pk.body.key.id, teamId: tm.body.team.id, label: 'frontend', monthlyBudgetUsd: 100,
  });
  return { ...ctx, agent: a, secret: vk.body.secret, virtualKeyId: vk.body.key.id, teamId: tm.body.team.id };
}

describe('requests', () => {
  it('rejects ingest without virtual key header', async () => {
    const { app } = await seed();
    const r = await request(app).post('/api/v1/requests').send({ provider: 'openai', model: 'gpt-4.1-mini' });
    expect(r.status).toBe(401);
  });

  it('ingests a request and computes cost', async () => {
    const { app, secret, virtualKeyId } = await seed();
    const r = await request(app).post('/api/v1/requests')
      .set('X-Meridian-Key', secret)
      .send({
        provider: 'openai', model: 'gpt-4.1-mini',
        promptTokens: 1000, completionTokens: 500, latencyMs: 230, status: 'ok',
      });
    expect(r.status).toBe(201);
    expect(r.body.costUsd).toBeCloseTo((1000 * 0.4 + 500 * 1.6) / 1_000_000, 8);
    expect(r.body.severity).toBe('ok');

    const list = await request.agent(app)        // session cookie not needed for ingest, but is for query
      .get(`/api/requests?virtualKeyId=${virtualKeyId}`);
    // Without session cookie, 401:
    expect(list.status).toBe(401);
  });

  it('list endpoint returns ingested rows when authenticated', async () => {
    const { app, agent, secret, virtualKeyId } = await seed();
    await request(app).post('/api/v1/requests')
      .set('X-Meridian-Key', secret)
      .send({ provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 100, completionTokens: 100, status: 'ok' });
    const list = await agent.get(`/api/requests?virtualKeyId=${virtualKeyId}`);
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.total).toBe(1);
  });
});
```

- [ ] **Step 3: Run, expect failure**

- [ ] **Step 4: Create middleware that authenticates by virtual key**

Create `server/lib/virtual-key-auth.js`:

```js
'use strict';
const bcrypt = require('bcryptjs');
const { jsonError } = require('./errors');

function authByVirtualKey({ store }) {
  return async (req, res, next) => {
    const header = req.get('X-Meridian-Key');
    if (!header || !/^mk_[A-Za-z0-9]{22}$/.test(header)) {
      return jsonError(res, 401, 'Missing or malformed X-Meridian-Key', { code: 'UNAUTHORIZED' });
    }
    const prefix = header.slice(0, 9);
    const candidates = await store.virtualKeys.findByPrefix(prefix);
    let match = null;
    for (const c of candidates) {
      if (bcrypt.compareSync(header, c.keyHash)) { match = c; break; }
    }
    if (!match) return jsonError(res, 401, 'Invalid X-Meridian-Key', { code: 'UNAUTHORIZED' });
    req.user = { id: match.userId };
    req.virtualKey = match;
    next();
  };
}

module.exports = { authByVirtualKey };
```

- [ ] **Step 5: Implement `server/routes/requests.js`**

```js
'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { ingestLimiter, userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { authByVirtualKey } = require('../lib/virtual-key-auth');
const { costFor } = require('../services/pricing');

const ingestBody = z.object({
  provider: z.enum(['anthropic', 'openai', 'google', 'mistral']),
  model: z.string().min(1).max(120),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
  latencyMs: z.number().int().nonnegative().default(0),
  status: z.enum(['ok', 'error', 'rate_limited']).default('ok'),
  taskType: z.string().max(40).optional(),
  agentId: z.number().int().positive().optional(),
}).strict();

const queryShape = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  teamId: z.string().regex(/^\d+$/).optional(),
  virtualKeyId: z.string().regex(/^\d+$/).optional(),
  agentId: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['ok', 'error', 'rate_limited']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
}).strict();

function register(app, { store, audit, budget, alerts }) {
  app.post('/api/v1/requests',
    ingestLimiter,
    authByVirtualKey({ store }),
    validate(z.object({ body: ingestBody })),
    async (req, res) => {
      const body = req.validated.body;
      const vk = req.virtualKey;
      const costUsd = costFor({
        provider: body.provider, model: body.model,
        promptTokens: body.promptTokens, completionTokens: body.completionTokens,
      });
      const sev = await budget.classify({ userId: vk.userId, virtualKeyId: vk.id, addUsd: costUsd });
      const row = await store.requests.add({
        userId: vk.userId, virtualKeyId: vk.id, teamId: vk.teamId, agentId: body.agentId || null,
        provider: body.provider, model: body.model,
        promptTokens: body.promptTokens, completionTokens: body.completionTokens,
        latencyMs: body.latencyMs, costUsd, status: body.status, taskType: body.taskType || null,
      });
      await store.virtualKeys.recordSpend(vk.id, costUsd);
      await alerts.onRequest({ request: row, severity: sev });
      audit.append({
        userId: vk.userId, action: 'request.ingest',
        target: { id: row.id }, meta: { provider: body.provider, model: body.model, costUsd, severity: sev.severity }, req,
      });
      res.status(201).json({ id: row.id, costUsd, severity: sev.severity, scope: sev.scope });
    }
  );

  app.get('/api/requests',
    requireUser,
    validate(z.object({ query: queryShape })),
    async (req, res) => {
      const q = req.validated.query;
      const out = await store.requests.query({
        userId: req.user.id,
        from: q.from, to: q.to,
        teamId: q.teamId, virtualKeyId: q.virtualKeyId, agentId: q.agentId, status: q.status,
        page: q.page ? Number(q.page) : 1,
        limit: q.limit ? Number(q.limit) : 50,
      });
      res.json({ requests: out.rows, page: out.page, limit: out.limit, total: out.total });
    }
  );
}

module.exports = { register };
```

- [ ] **Step 6: Wire into `server/app.js`**

Add after `ctx.audit = ...`:

```js
const { createBudgetEngine } = require('./services/budget-engine');
const { createAlertEngine } = require('./services/alert-engine');           // Task 11
ctx.budget = createBudgetEngine({ store });
ctx.alerts = createAlertEngine({ store });
require('./routes/requests').register(app, ctx);
```

(Note: alerts service is defined in Task 11. Until then, stub it: `ctx.alerts = { onRequest: async () => {} };` and replace with the real one in Task 11.)

- [ ] **Step 7: Run, expect pass, commit**

```bash
npm test -- requests
git add server/ test/
git commit -m "feat(requests): ingestion endpoint + filtered query"
```

---

### Task 10: KPI aggregation endpoints

**Files:**
- Create: `server/routes/kpi.js`
- Test: `test/server/kpi.test.js`

The Overview page wants:
- Total spend (MTD)
- Total requests (MTD)
- Estimated savings vs "always premium" baseline
- Daily spend series (last 30 days)
- Spend by team
- Model mix

The Feed page wants:
- Requests per minute (last 5 min)
- Tokens per second (last 60 sec)
- $/hour rate (last 60 min)

- [ ] **Step 1: Write failing test**

```js
// test/server/kpi.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

async function seedRequests(ctx, n) {
  // Insert directly into the store to avoid bcrypt round-trips in a tight loop.
  const u = await ctx.store.users.add({ email: 'a@b.com', passwordHash: 'h' });
  const team = await ctx.store.teams.add(u.id, { name: 'T', monthlyBudgetUsd: 1000 });
  const pk = await ctx.store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'x', iv: 'a', ciphertext: 'b', authTag: 'c' });
  const vk = await ctx.store.virtualKeys.add(u.id, { providerKeyId: pk.id, teamId: team.id, label: 'x', prefix: 'mk_zzzzzz', keyHash: 'h', monthlyBudgetUsd: null });
  for (let i = 0; i < n; i++) {
    await ctx.store.requests.add({
      userId: u.id, virtualKeyId: vk.id, teamId: team.id, agentId: null,
      provider: 'openai', model: 'gpt-4.1-mini',
      promptTokens: 100, completionTokens: 100, latencyMs: 200, costUsd: 0.0002, status: 'ok',
    });
  }
  return { userId: u.id, teamId: team.id };
}

describe('kpi', () => {
  it('overview returns aggregates for the current user', async () => {
    const ctx = makeApp();
    const { userId } = await seedRequests(ctx, 5);

    // Simulate session cookie by signing in as the seeded user is awkward; instead
    // create a parallel signed-in agent and seed under that user.
    // We'll re-seed via the HTTP path in a real test; for now ensure the endpoint exists:
    const r = await request(ctx.app).get('/api/kpi/overview');
    expect(r.status).toBe(401); // unauthenticated
  });

  it('overview after ingesting 3 requests returns totals', async () => {
    const ctx = makeApp();
    const a = request.agent(ctx.app);
    await a.post('/api/auth/signup').send({ email: 'b@c.com', password: 'longenough1' });
    const pk = await a.post('/api/provider-keys').send({ provider: 'openai', apiKey: 'sk-1234567890' });
    const vk = await a.post('/api/virtual-keys').send({ providerKeyId: pk.body.key.id, label: 'k' });
    for (let i = 0; i < 3; i++) {
      await request(ctx.app).post('/api/v1/requests')
        .set('X-Meridian-Key', vk.body.secret)
        .send({ provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 100, completionTokens: 100, status: 'ok' });
    }
    const r = await a.get('/api/kpi/overview');
    expect(r.status).toBe(200);
    expect(r.body.totalRequests).toBe(3);
    expect(r.body.totalSpendUsd).toBeGreaterThan(0);
    expect(Array.isArray(r.body.dailySpend)).toBe(true);
    expect(Array.isArray(r.body.modelMix)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement `server/routes/kpi.js`**

```js
'use strict';
const { requireUser } = require('../auth-middleware');
const { TABLE } = require('../services/pricing');

function startOfMonthIso(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString();
}

function nDaysAgoIso(n, now = new Date()) {
  const d = new Date(now.getTime() - n * 24 * 3600 * 1000);
  return d.toISOString();
}

function nMinutesAgoIso(n, now = new Date()) {
  return new Date(now.getTime() - n * 60_000).toISOString();
}

function dayKey(iso) { return iso.slice(0, 10); }

function premiumModelFor(provider) {
  // baseline cost = "what would it cost if the user used the most expensive model in the same provider?"
  const models = TABLE[provider] || {};
  let max = null;
  for (const [model, p] of Object.entries(models)) {
    const ratio = (p.input + p.output) / 2;
    if (!max || ratio > max.ratio) max = { model, ratio, prices: p };
  }
  return max;
}

function register(app, { store }) {
  app.get('/api/kpi/overview', requireUser, async (req, res) => {
    const userId = req.user.id;
    const monthStart = startOfMonthIso();
    const since30 = nDaysAgoIso(30);

    const { rows: monthly } = await store.requests.query({ userId, from: monthStart, page: 1, limit: 100000 });
    const { rows: daily30 } = await store.requests.query({ userId, from: since30,    page: 1, limit: 100000 });

    let totalSpend = 0, totalRequests = monthly.length;
    let promptTok = 0, completionTok = 0;
    const byModel = new Map();
    const byTeam = new Map();
    let baseline = 0;

    for (const r of monthly) {
      totalSpend += r.costUsd || 0;
      promptTok += r.promptTokens || 0;
      completionTok += r.completionTokens || 0;
      byModel.set(r.model, (byModel.get(r.model) || 0) + (r.costUsd || 0));
      byTeam.set(r.teamId || 0, (byTeam.get(r.teamId || 0) || 0) + (r.costUsd || 0));
      const top = premiumModelFor(r.provider);
      if (top) {
        baseline += (r.promptTokens * top.prices.input + r.completionTokens * top.prices.output) / 1_000_000;
      }
    }

    const dailyMap = new Map();
    for (const r of daily30) {
      const k = dayKey(r.timestamp);
      dailyMap.set(k, (dailyMap.get(k) || 0) + (r.costUsd || 0));
    }
    const dailySpend = [];
    for (let i = 29; i >= 0; i--) {
      const k = dayKey(nDaysAgoIso(i));
      dailySpend.push({ date: k, costUsd: Number((dailyMap.get(k) || 0).toFixed(6)) });
    }

    const teams = await store.teams.list(userId);
    const teamSpend = teams.map(t => ({
      teamId: t.id, name: t.name, monthlyBudgetUsd: t.monthlyBudgetUsd,
      spentUsd: Number((byTeam.get(t.id) || 0).toFixed(6)),
    }));

    const modelMix = [...byModel.entries()].map(([model, costUsd]) => ({
      model, costUsd: Number(costUsd.toFixed(6)),
    })).sort((a, b) => b.costUsd - a.costUsd);

    res.json({
      totalSpendUsd: Number(totalSpend.toFixed(6)),
      totalRequests,
      totalPromptTokens: promptTok,
      totalCompletionTokens: completionTok,
      estimatedSavingsUsd: Math.max(0, Number((baseline - totalSpend).toFixed(6))),
      baselineSpendUsd: Number(baseline.toFixed(6)),
      dailySpend, teamSpend, modelMix,
    });
  });

  app.get('/api/kpi/feed', requireUser, async (req, res) => {
    const userId = req.user.id;
    const last5min  = await store.requests.query({ userId, from: nMinutesAgoIso(5),  page: 1, limit: 100000 });
    const last1min  = await store.requests.query({ userId, from: nMinutesAgoIso(1),  page: 1, limit: 100000 });
    const last1hour = await store.requests.query({ userId, from: nMinutesAgoIso(60), page: 1, limit: 100000 });

    const tokensLast60s = last1min.rows.reduce((s, r) => s + (r.promptTokens || 0) + (r.completionTokens || 0), 0);
    const costLast60min = last1hour.rows.reduce((s, r) => s + (r.costUsd || 0), 0);

    res.json({
      requestsPerMinute: Number((last5min.rows.length / 5).toFixed(2)),
      tokensPerSecond: Number((tokensLast60s / 60).toFixed(2)),
      costPerHourUsd: Number(costLast60min.toFixed(6)),
      recent: last5min.rows.slice(0, 50),     // newest first per query()
    });
  });
}

module.exports = { register };
```

- [ ] **Step 4: Register in `server/app.js`. Run tests, expect pass, commit**

```bash
npm test -- kpi
git add server/routes/kpi.js test/server/kpi.test.js
git commit -m "feat(kpi): overview + feed aggregation endpoints"
```

---

### Task 11: Alerts CRUD + alert engine

**Files:**
- Modify: `server/store/json.js` (implement `alerts`)
- Create: `server/routes/alerts.js`
- Create: `server/services/alert-engine.js`
- Modify: `server/app.js` (register, replace stub from Task 9)
- Test: `test/server/alerts.test.js`, `test/services/alert-engine.test.js`

The alert engine runs **on every request ingestion**. Cheap, synchronous, in-process. Each alert has a `state` that the engine flips to `'triggered'` when the threshold is crossed.

Alert types:
- `team_budget` — `{ teamId, thresholdUsd }`. Triggers when team's MTD spend ≥ threshold.
- `key_budget` — `{ virtualKeyId, thresholdUsd }`. Triggers when key's MTD spend ≥ threshold.
- `agent_loop` — `{ agentId, maxIterations }`. (Triggers from agent run updates, not request ingestion. Stubbed for MVP — wire in Task 12.)
- `spike` — `{ thresholdRpm, windowMinutes }`. Triggers when requests-per-minute > threshold over the window.

- [ ] **Step 1: Implement `store.alerts`**

Replace `alerts: notImplemented('alerts')` with:

```js
alerts: {
  list: (userId) => wrap(
    data.alerts.filter(a => String(a.userId) === String(userId)).sort((a, b) => b.id - a.id)
  ),
  add: (userId, row) => {
    const r = {
      id: data.nextAlertId++, userId: Number(userId),
      name: String(row.name), type: String(row.type),
      target: row.target || null,
      thresholdUsd: row.thresholdUsd == null ? null : Number(row.thresholdUsd),
      thresholdRpm: row.thresholdRpm == null ? null : Number(row.thresholdRpm),
      windowMinutes: row.windowMinutes == null ? null : Number(row.windowMinutes),
      state: 'active', lastTriggeredAt: null, createdAt: nowIso(),
    };
    data.alerts.push(r);
    persist();
    return wrap(r);
  },
  update: (userId, id, patch) => {
    const a = data.alerts.find(a => String(a.userId) === String(userId) && a.id === Number(id));
    if (!a) return wrap(null);
    for (const f of ['name', 'state', 'thresholdUsd', 'thresholdRpm', 'windowMinutes', 'lastTriggeredAt']) {
      if (f in patch) a[f] = patch[f];
    }
    persist();
    return wrap(a);
  },
  delete: (userId, id) => {
    const i = data.alerts.findIndex(a => String(a.userId) === String(userId) && a.id === Number(id));
    if (i === -1) return wrap(false);
    data.alerts.splice(i, 1);
    persist();
    return wrap(true);
  },
  setTriggered: (id, when = nowIso()) => {
    const a = data.alerts.find(a => a.id === Number(id));
    if (!a) return wrap(null);
    a.state = 'triggered';
    a.lastTriggeredAt = when;
    persist();
    return wrap(a);
  },
  forUser: (userId, predicate) => wrap(
    data.alerts.filter(a => String(a.userId) === String(userId) && a.state === 'active' && predicate(a))
  ),
},
```

- [ ] **Step 2: Write failing alert engine test**

```js
// test/services/alert-engine.test.js
'use strict';
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');
const { createAlertEngine } = require('../../server/services/alert-engine');

async function setup() {
  const { store } = makeApp();
  const u = await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
  const team = await store.teams.add(u.id, { name: 'T', monthlyBudgetUsd: 1000 });
  const pk = await store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'x', iv: 'a', ciphertext: 'b', authTag: 'c' });
  const vk = await store.virtualKeys.add(u.id, { providerKeyId: pk.id, teamId: team.id, label: 'x', prefix: 'mk_aaaaaa', keyHash: 'h', monthlyBudgetUsd: 50 });
  return { store, u, team, vk };
}

describe('alert engine', () => {
  it('triggers a key_budget alert when spend exceeds threshold', async () => {
    const { store, u, vk } = await setup();
    const alert = await store.alerts.add(u.id, { name: 'big', type: 'key_budget', target: { virtualKeyId: vk.id }, thresholdUsd: 25 });

    await store.virtualKeys.recordSpend(vk.id, 30);
    const eng = createAlertEngine({ store });
    await eng.onRequest({
      request: { userId: u.id, virtualKeyId: vk.id, teamId: vk.teamId, costUsd: 0.01, timestamp: new Date().toISOString() },
      severity: { severity: 'over', scope: 'key' },
    });
    const after = (await store.alerts.list(u.id))[0];
    expect(after.state).toBe('triggered');
  });

  it('does not trigger a paused alert', async () => {
    const { store, u, vk } = await setup();
    await store.alerts.add(u.id, { name: 'p', type: 'key_budget', target: { virtualKeyId: vk.id }, thresholdUsd: 1 });
    const list1 = await store.alerts.list(u.id);
    await store.alerts.update(u.id, list1[0].id, { state: 'paused' });
    await store.virtualKeys.recordSpend(vk.id, 100);
    const eng = createAlertEngine({ store });
    await eng.onRequest({
      request: { userId: u.id, virtualKeyId: vk.id, teamId: vk.teamId, costUsd: 1, timestamp: new Date().toISOString() },
      severity: { severity: 'over', scope: 'key' },
    });
    const after = (await store.alerts.list(u.id))[0];
    expect(after.state).toBe('paused');
  });
});
```

- [ ] **Step 3: Implement `server/services/alert-engine.js`**

```js
'use strict';

function createAlertEngine({ store }) {
  return {
    onRequest: async ({ request, severity }) => {
      const userId = request.userId;
      const alerts = await store.alerts.list(userId);
      for (const a of alerts) {
        if (a.state !== 'active') continue;
        let shouldTrigger = false;
        if (a.type === 'key_budget' && a.target?.virtualKeyId === request.virtualKeyId) {
          const vk = await store.virtualKeys.get(userId, request.virtualKeyId);
          if (vk && (vk.spentMtdUsd || 0) >= (a.thresholdUsd || Infinity)) shouldTrigger = true;
        } else if (a.type === 'team_budget' && a.target?.teamId && a.target.teamId === request.teamId) {
          const keys = await store.virtualKeys.list(userId);
          const teamSpend = keys.filter(k => k.teamId === a.target.teamId).reduce((s, k) => s + (k.spentMtdUsd || 0), 0);
          if (teamSpend >= (a.thresholdUsd || Infinity)) shouldTrigger = true;
        } else if (a.type === 'spike') {
          const since = new Date(Date.now() - (a.windowMinutes || 5) * 60_000).toISOString();
          const count = await store.requests.countSince(userId, since);
          const rpm = count / (a.windowMinutes || 5);
          if (rpm >= (a.thresholdRpm || Infinity)) shouldTrigger = true;
        }
        if (shouldTrigger) await store.alerts.setTriggered(a.id);
      }
    },
  };
}

module.exports = { createAlertEngine };
```

- [ ] **Step 4: Run engine test, expect pass**

- [ ] **Step 5: Implement `server/routes/alerts.js`**

```js
'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');

const targetShape = z.object({
  teamId: z.number().int().positive().optional(),
  virtualKeyId: z.number().int().positive().optional(),
  agentId: z.number().int().positive().optional(),
}).strict();

const createBody = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['team_budget', 'key_budget', 'agent_loop', 'spike']),
  target: targetShape.optional(),
  thresholdUsd: z.number().nonnegative().nullable().optional(),
  thresholdRpm: z.number().nonnegative().nullable().optional(),
  windowMinutes: z.number().int().positive().max(1440).nullable().optional(),
}).strict();

const patchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  state: z.enum(['active', 'paused']).optional(),    // 'triggered' set by engine only
  thresholdUsd: z.number().nonnegative().nullable().optional(),
  thresholdRpm: z.number().nonnegative().nullable().optional(),
  windowMinutes: z.number().int().positive().max(1440).nullable().optional(),
}).strict();

function register(app, { store, audit }) {
  app.get('/api/alerts', requireUser, async (req, res) => {
    res.json({ alerts: await store.alerts.list(req.user.id) });
  });

  app.post('/api/alerts', requireUser, userWriteLimiter,
    validate(z.object({ body: createBody })),
    async (req, res) => {
      const a = await store.alerts.add(req.user.id, req.validated.body);
      audit.append({ userId: req.user.id, action: 'alert.create', target: { id: a.id }, req });
      res.status(201).json({ alert: a });
    }
  );

  app.put('/api/alerts/:id', requireUser, userWriteLimiter,
    validate(z.object({
      params: z.object({ id: z.string().regex(/^\d+$/) }).strict(),
      body: patchBody,
    })),
    async (req, res) => {
      const a = await store.alerts.update(req.user.id, req.validated.params.id, req.validated.body);
      if (!a) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'alert.update', target: { id: a.id }, req });
      res.json({ alert: a });
    }
  );

  app.delete('/api/alerts/:id', requireUser, userWriteLimiter,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      const ok = await store.alerts.delete(req.user.id, req.validated.params.id);
      if (!ok) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'alert.delete', target: { id: Number(req.validated.params.id) }, req });
      res.json({ ok: true });
    }
  );
}

module.exports = { register };
```

- [ ] **Step 6: Replace the stub from Task 9 in `server/app.js`**

Remove `ctx.alerts = { onRequest: async () => {} };` and replace with:

```js
ctx.alerts = createAlertEngine({ store });
require('./routes/alerts').register(app, ctx);
```

- [ ] **Step 7: Write HTTP test, run, commit**

```js
// test/server/alerts.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

describe('alerts', () => {
  it('CRUD round-trip', async () => {
    const { app } = makeApp();
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    const create = await a.post('/api/alerts').send({ name: 'monthly', type: 'team_budget', target: { teamId: 1 }, thresholdUsd: 1000 });
    expect(create.status).toBe(201);
    const id = create.body.alert.id;

    const list = await a.get('/api/alerts');
    expect(list.body.alerts).toHaveLength(1);

    const upd = await a.put(`/api/alerts/${id}`).send({ state: 'paused' });
    expect(upd.body.alert.state).toBe('paused');

    const del = await a.delete(`/api/alerts/${id}`);
    expect(del.status).toBe(200);
  });
});
```

```bash
npm test
git add server/ test/
git commit -m "feat(alerts): CRUD + threshold engine on request ingestion"
```

---

### Task 12: Agents + agent runs

**Files:**
- Modify: `server/store/json.js` (implement `agents`, `agentRuns`)
- Create: `server/routes/agents.js`
- Modify: `server/app.js` (register)
- Test: `test/server/agents.test.js`

Agents are user-defined long-running tasks. A run is a contiguous batch of requests tagged with `agentId`. Runs aggregate cost + iteration count.

- [ ] **Step 1: Implement `store.agents` and `store.agentRuns`**

Replace the two `notImplemented` lines with:

```js
agents: {
  list: (userId) => wrap(data.agents.filter(a => String(a.userId) === String(userId)).sort((a, b) => b.id - a.id)),
  get: (userId, id) => wrap(data.agents.find(a => String(a.userId) === String(userId) && a.id === Number(id)) || null),
  add: (userId, row) => {
    const r = {
      id: data.nextAgentId++, userId: Number(userId),
      teamId: row.teamId == null ? null : Number(row.teamId),
      name: String(row.name), description: String(row.description || ''),
      status: 'idle',
      maxRunCostUsd: row.maxRunCostUsd == null ? null : Number(row.maxRunCostUsd),
      maxLoopIterations: row.maxLoopIterations == null ? null : Number(row.maxLoopIterations),
      createdAt: nowIso(),
    };
    data.agents.push(r);
    persist();
    return wrap(r);
  },
  update: (userId, id, patch) => {
    const a = data.agents.find(a => String(a.userId) === String(userId) && a.id === Number(id));
    if (!a) return wrap(null);
    for (const f of ['name', 'description', 'status', 'teamId', 'maxRunCostUsd', 'maxLoopIterations']) {
      if (f in patch) a[f] = patch[f];
    }
    persist();
    return wrap(a);
  },
  delete: (userId, id) => {
    const i = data.agents.findIndex(a => String(a.userId) === String(userId) && a.id === Number(id));
    if (i === -1) return wrap(false);
    data.agents.splice(i, 1);
    persist();
    return wrap(true);
  },
},
agentRuns: {
  list: (userId, agentId) => wrap(
    data.agentRuns
      .filter(r => String(r.userId) === String(userId) && String(r.agentId) === String(agentId))
      .sort((a, b) => b.id - a.id)
  ),
  add: (userId, agentId, row) => {
    const r = {
      id: data.nextAgentRunId++, userId: Number(userId), agentId: Number(agentId),
      startedAt: row.startedAt || nowIso(),
      endedAt: row.endedAt || null,
      status: row.status || 'running',
      requestCount: 0, costUsd: 0, iterationCount: 0, lastRequestId: null,
    };
    data.agentRuns.push(r);
    persist();
    return wrap(r);
  },
  patch: (id, patch) => {
    const r = data.agentRuns.find(r => r.id === Number(id));
    if (!r) return wrap(null);
    for (const f of ['endedAt', 'status', 'requestCount', 'costUsd', 'iterationCount', 'lastRequestId']) {
      if (f in patch) r[f] = patch[f];
    }
    persist();
    return wrap(r);
  },
},
```

- [ ] **Step 2: Implement `server/routes/agents.js`**

Endpoints:
- `GET /api/agents`
- `POST /api/agents`
- `PUT /api/agents/:id`
- `DELETE /api/agents/:id`
- `GET /api/agents/:id/runs`
- `POST /api/agents/:id/runs` — start a new run (returns `{ runId }`)
- `PUT /api/agents/:id/runs/:runId` — close a run with final status

```js
'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');

const createBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().default(''),
  teamId: z.number().int().positive().nullable().optional(),
  maxRunCostUsd: z.number().nonnegative().nullable().optional(),
  maxLoopIterations: z.number().int().positive().max(10000).nullable().optional(),
}).strict();

const patchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['idle', 'running', 'paused']).optional(),
  teamId: z.number().int().positive().nullable().optional(),
  maxRunCostUsd: z.number().nonnegative().nullable().optional(),
  maxLoopIterations: z.number().int().positive().max(10000).nullable().optional(),
}).strict();

const runPatch = z.object({
  status: z.enum(['running', 'completed', 'killed', 'failed']).optional(),
  endedAt: z.string().optional(),
  iterationCount: z.number().int().nonnegative().optional(),
}).strict();

function register(app, { store, audit }) {
  app.get('/api/agents', requireUser, async (req, res) => {
    res.json({ agents: await store.agents.list(req.user.id) });
  });

  app.post('/api/agents', requireUser, userWriteLimiter,
    validate(z.object({ body: createBody })),
    async (req, res) => {
      const a = await store.agents.add(req.user.id, req.validated.body);
      audit.append({ userId: req.user.id, action: 'agent.create', target: { id: a.id }, req });
      res.status(201).json({ agent: a });
    }
  );

  app.put('/api/agents/:id', requireUser, userWriteLimiter,
    validate(z.object({
      params: z.object({ id: z.string().regex(/^\d+$/) }).strict(),
      body: patchBody,
    })),
    async (req, res) => {
      const a = await store.agents.update(req.user.id, req.validated.params.id, req.validated.body);
      if (!a) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'agent.update', target: { id: a.id }, req });
      res.json({ agent: a });
    }
  );

  app.delete('/api/agents/:id', requireUser, userWriteLimiter,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      const ok = await store.agents.delete(req.user.id, req.validated.params.id);
      if (!ok) return jsonError(res, 404, 'Not found');
      audit.append({ userId: req.user.id, action: 'agent.delete', target: { id: Number(req.validated.params.id) }, req });
      res.json({ ok: true });
    }
  );

  app.get('/api/agents/:id/runs', requireUser,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      res.json({ runs: await store.agentRuns.list(req.user.id, req.validated.params.id) });
    }
  );

  app.post('/api/agents/:id/runs', requireUser, userWriteLimiter,
    validate(z.object({ params: z.object({ id: z.string().regex(/^\d+$/) }).strict() })),
    async (req, res) => {
      const a = await store.agents.get(req.user.id, req.validated.params.id);
      if (!a) return jsonError(res, 404, 'Agent not found');
      const run = await store.agentRuns.add(req.user.id, a.id, {});
      await store.agents.update(req.user.id, a.id, { status: 'running' });
      audit.append({ userId: req.user.id, action: 'agent.run.start', target: { agentId: a.id, runId: run.id }, req });
      res.status(201).json({ run });
    }
  );

  app.put('/api/agents/:id/runs/:runId', requireUser, userWriteLimiter,
    validate(z.object({
      params: z.object({ id: z.string().regex(/^\d+$/), runId: z.string().regex(/^\d+$/) }).strict(),
      body: runPatch,
    })),
    async (req, res) => {
      const r = await store.agentRuns.patch(req.validated.params.runId, req.validated.body);
      if (!r) return jsonError(res, 404, 'Not found');
      if (req.validated.body.status && ['completed', 'killed', 'failed'].includes(req.validated.body.status)) {
        await store.agents.update(req.user.id, req.validated.params.id, { status: 'idle' });
      }
      audit.append({ userId: req.user.id, action: 'agent.run.update', target: { agentId: Number(req.validated.params.id), runId: r.id }, req });
      res.json({ run: r });
    }
  );
}

module.exports = { register };
```

- [ ] **Step 3: Update request ingestion to bump the agent run**

In `server/routes/requests.js`, after `await store.virtualKeys.recordSpend(...)`, add:

```js
if (body.agentId) {
  // Find the most recent open run for this agent and bump it.
  const runs = await store.agentRuns.list(vk.userId, body.agentId);
  const open = runs.find(r => r.status === 'running');
  if (open) {
    await store.agentRuns.patch(open.id, {
      requestCount: (open.requestCount || 0) + 1,
      costUsd: Number(((open.costUsd || 0) + costUsd).toFixed(6)),
      lastRequestId: row.id,
    });
  }
}
```

- [ ] **Step 4: HTTP test**

```js
// test/server/agents.test.js
'use strict';
const request = require('supertest');
const { describe, it, expect } = require('vitest');
const { makeApp } = require('../helpers/make-app');

describe('agents', () => {
  it('create → start run → ingest request → list runs', async () => {
    const { app } = makeApp();
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    const pk = await a.post('/api/provider-keys').send({ provider: 'openai', apiKey: 'sk-1234567890' });
    const vk = await a.post('/api/virtual-keys').send({ providerKeyId: pk.body.key.id, label: 'k' });
    const ag = await a.post('/api/agents').send({ name: 'reviewer' });

    const run = await a.post(`/api/agents/${ag.body.agent.id}/runs`).send({});
    expect(run.status).toBe(201);

    await request(app).post('/api/v1/requests')
      .set('X-Meridian-Key', vk.body.secret)
      .send({ provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 500, completionTokens: 500, agentId: ag.body.agent.id });

    const runs = await a.get(`/api/agents/${ag.body.agent.id}/runs`);
    expect(runs.body.runs[0].requestCount).toBe(1);
    expect(runs.body.runs[0].costUsd).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run, expect pass, commit**

```bash
npm test
git add server/ test/
git commit -m "feat(agents): CRUD + run lifecycle bumped on request ingest"
```

---

### Task 13: Doctor + seed-demo scripts

**Files:**
- Create: `scripts/doctor.js`
- Create: `scripts/seed-demo.js`
- Modify: `package.json` (`scripts.doctor`, `scripts.seed`)
- Test: none — these are operational scripts.

- [ ] **Step 1: Implement `scripts/doctor.js`**

```js
#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const checks = [];

function ok(name, detail) { checks.push({ ok: true, name, detail: detail || '' }); }
function fail(name, detail) { checks.push({ ok: false, name, detail: detail || '' }); }

(async function main() {
  // Env
  if ((process.env.JWT_SECRET || '').length >= 32) ok('JWT_SECRET', 'present (>=32 chars)');
  else fail('JWT_SECRET', 'missing or too short — see .env.example');

  if (/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY || '')) ok('ENCRYPTION_KEY', '64 hex chars');
  else fail('ENCRYPTION_KEY', 'not 64 hex chars — generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');

  ok('PORT', String(process.env.PORT || 5500));
  ok('NODE_ENV', String(process.env.NODE_ENV || 'development'));

  // Store
  try {
    const { createStore } = require('../server/store');
    const storePath = process.env.MERIDIAN_STORE_PATH || path.join(__dirname, '..', 'data', 'meridian-store.json');
    const store = createStore({ kind: 'json', path: storePath });
    const users = await store.users.all();
    ok('store', `${storePath} (${users.length} users)`);
  } catch (e) {
    fail('store', e.message);
  }

  // Pricing table
  try {
    const { listModels } = require('../server/services/pricing');
    ok('pricing', `${listModels().length} models priced`);
  } catch (e) {
    fail('pricing', e.message);
  }

  let failed = 0;
  for (const c of checks) {
    const tag = c.ok ? '✓' : '✗';
    console.log(`${tag} ${c.name.padEnd(18)} ${c.detail}`);
    if (!c.ok) failed++;
  }
  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nall good.');
})();
```

- [ ] **Step 2: Implement `scripts/seed-demo.js`**

Write a script that:
- Creates a demo user `demo@meridian.local` with password `demo123demo`
- Adds one provider key per provider (placeholders, not real)
- Creates 3 teams, 6 virtual keys, 3 agents, 4 alerts
- Inserts ~500 fake `requests` spanning the last 30 days, distributed across keys + models so the Overview page has interesting numbers

```js
#!/usr/bin/env node
'use strict';

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

const { createStore } = require('../server/store');
const { encryptSecret } = require('../server/crypto-secret');
const { costFor, listModels } = require('../server/services/pricing');

(async function main() {
  const storePath = process.env.MERIDIAN_STORE_PATH || path.join(__dirname, '..', 'data', 'meridian-store.json');
  const store = createStore({ kind: 'json', path: storePath });

  let user = await store.users.findByEmail('demo@meridian.local');
  if (!user) user = await store.users.add({ email: 'demo@meridian.local', passwordHash: bcrypt.hashSync('demo123demo', 10) });

  const providers = ['anthropic', 'openai', 'google', 'mistral'];
  const providerKeys = {};
  for (const p of providers) {
    const enc = encryptSecret(`sk-${p}-demo-${crypto.randomBytes(8).toString('hex')}`);
    const row = await store.providerKeys.add(user.id, { provider: p, label: 'demo', mask: 'sk-d···demo', ...enc });
    providerKeys[p] = row.id;
  }

  const teams = [];
  for (const name of ['Engineering', 'Research', 'Marketing']) {
    teams.push(await store.teams.add(user.id, { name, monthlyBudgetUsd: 1500 }));
  }

  const vKeys = [];
  for (let i = 0; i < 6; i++) {
    const provider = providers[i % providers.length];
    const team = teams[i % teams.length];
    const secret = `mk_${crypto.randomBytes(16).toString('base64url').slice(0, 22)}`;
    vKeys.push(await store.virtualKeys.add(user.id, {
      providerKeyId: providerKeys[provider], teamId: team.id,
      label: `${team.name} key ${i + 1}`,
      prefix: secret.slice(0, 9), keyHash: bcrypt.hashSync(secret, 6),
      monthlyBudgetUsd: 250 + (i * 100),
    }));
  }

  for (const name of ['paper-summarizer', 'code-reviewer', 'support-triager']) {
    await store.agents.add(user.id, { name, description: `${name} demo agent`, teamId: teams[0].id, maxRunCostUsd: 5, maxLoopIterations: 50 });
  }

  await store.alerts.add(user.id, { name: 'Eng monthly', type: 'team_budget', target: { teamId: teams[0].id }, thresholdUsd: 1200 });
  await store.alerts.add(user.id, { name: 'Spike', type: 'spike', thresholdRpm: 60, windowMinutes: 5 });
  await store.alerts.add(user.id, { name: 'Frontend cap', type: 'key_budget', target: { virtualKeyId: vKeys[0].id }, thresholdUsd: 200 });

  const models = listModels();
  const now = Date.now();
  for (let i = 0; i < 500; i++) {
    const m = models[Math.floor(Math.random() * models.length)];
    const vk = vKeys[Math.floor(Math.random() * vKeys.length)];
    const promptTokens = 200 + Math.floor(Math.random() * 4000);
    const completionTokens = 100 + Math.floor(Math.random() * 1500);
    const ts = new Date(now - Math.floor(Math.random() * 30 * 24 * 3600 * 1000)).toISOString();
    const cost = costFor({ provider: m.provider, model: m.model, promptTokens, completionTokens });
    await store.requests.add({
      userId: user.id, virtualKeyId: vk.id, teamId: vk.teamId, agentId: null,
      provider: m.provider, model: m.model, promptTokens, completionTokens,
      latencyMs: 120 + Math.floor(Math.random() * 800),
      costUsd: cost, status: Math.random() < 0.95 ? 'ok' : 'error',
      timestamp: ts,
    });
  }

  console.log(`Seeded demo data into ${storePath}`);
  console.log('Login with demo@meridian.local / demo123demo');
})();
```

- [ ] **Step 3: Add scripts**

In `package.json`:

```json
"doctor": "node scripts/doctor.js",
"seed:demo": "node scripts/seed-demo.js"
```

- [ ] **Step 4: Smoke run, commit**

```bash
node scripts/doctor.js
node scripts/seed-demo.js
node scripts/doctor.js                      # should now show users count > 0
git add scripts/ package.json
git commit -m "chore(ops): doctor + seed-demo scripts"
```

---

### Task 14: Frontend API client

**Files:**
- Create: `src/core/api.jsx`
- Modify: `Meridian.html` (load `api.jsx` after `data.jsx`, before pages)

The frontend stays no-bundler. The API client is one JSX file exposing `window.MeridianAPI`. It does:

- `MeridianAPI.live` — boolean read from `window.MERIDIAN_LIVE` (set in HTML, default `false`)
- `MeridianAPI.fetch(path, init)` — wraps `fetch` with `credentials: 'include'` and JSON content-type
- `MeridianAPI.get(path)`, `post(path, body)`, `put`, `del`
- Per-domain helpers: `auth.{me, login, signup, logout}`, `teams.{list, create, update, delete}`, `virtualKeys.*`, `agents.*`, `alerts.*`, `requests.list({...})`, `kpi.{overview, feed}`, `auditLog.list`
- Each helper returns the response body, or throws an `Error` with a `.status` and `.code` set from the JSON error envelope.

- [ ] **Step 1: Create `src/core/api.jsx`**

```jsx
// Minimal fetch wrapper for the Meridian API. Loaded as raw JSX before pages.
(function () {
  const live = !!window.MERIDIAN_LIVE;

  async function call(method, path, body) {
    const init = {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data && data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  const API = {
    live,
    get:    (p)         => call('GET', p),
    post:   (p, b)      => call('POST', p, b),
    put:    (p, b)      => call('PUT', p, b),
    del:    (p)         => call('DELETE', p),

    auth: {
      me:     () => call('GET',  '/api/auth/me'),
      login:  (email, password) => call('POST', '/api/auth/login',  { email, password }),
      signup: (email, password) => call('POST', '/api/auth/signup', { email, password }),
      logout: () => call('POST', '/api/auth/logout'),
    },
    teams: {
      list:   () => call('GET',  '/api/teams'),
      create: (b) => call('POST', '/api/teams', b),
      update: (id, b) => call('PUT', `/api/teams/${id}`, b),
      delete: (id) => call('DELETE', `/api/teams/${id}`),
    },
    providerKeys: {
      list:   () => call('GET',  '/api/provider-keys'),
      create: (b) => call('POST', '/api/provider-keys', b),
      delete: (id) => call('DELETE', `/api/provider-keys/${id}`),
    },
    virtualKeys: {
      list:   () => call('GET',  '/api/virtual-keys'),
      create: (b) => call('POST', '/api/virtual-keys', b),
      update: (id, b) => call('PUT', `/api/virtual-keys/${id}`, b),
      delete: (id) => call('DELETE', `/api/virtual-keys/${id}`),
    },
    agents: {
      list:   () => call('GET',  '/api/agents'),
      create: (b) => call('POST', '/api/agents', b),
      update: (id, b) => call('PUT', `/api/agents/${id}`, b),
      delete: (id) => call('DELETE', `/api/agents/${id}`),
      startRun: (id) => call('POST', `/api/agents/${id}/runs`),
      patchRun: (id, runId, b) => call('PUT', `/api/agents/${id}/runs/${runId}`, b),
      runs:     (id) => call('GET',  `/api/agents/${id}/runs`),
    },
    alerts: {
      list:   () => call('GET',  '/api/alerts'),
      create: (b) => call('POST', '/api/alerts', b),
      update: (id, b) => call('PUT', `/api/alerts/${id}`, b),
      delete: (id) => call('DELETE', `/api/alerts/${id}`),
    },
    requests: {
      list: (params) => {
        const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null)).toString();
        return call('GET', `/api/requests${qs ? `?${qs}` : ''}`);
      },
    },
    kpi: {
      overview: () => call('GET', '/api/kpi/overview'),
      feed:     () => call('GET', '/api/kpi/feed'),
    },
    auditLog: {
      list: (limit) => call('GET', `/api/audit-log${limit ? `?limit=${limit}` : ''}`),
    },
  };

  window.MeridianAPI = API;
})();
```

- [ ] **Step 2: Add a `MERIDIAN_LIVE` toggle and load order in `Meridian.html`**

Add this right after the boot-error script (~line 33):

```html
<script>window.MERIDIAN_LIVE = false;</script>
```

And insert the API client after `data.jsx`:

```html
<script type="text/babel" src="src/core/data.jsx"></script>
<script type="text/babel" src="src/core/api.jsx"></script>
```

- [ ] **Step 3: Commit**

```bash
git add src/core/api.jsx Meridian.html
git commit -m "feat(frontend): MeridianAPI fetch wrapper + MERIDIAN_LIVE toggle"
```

---

### Task 15: Wire Overview page to live API

**Files:**
- Modify: `src/pages/overview.jsx`

Goal: when `MeridianAPI.live` is true and the user is signed in, the Overview page reads from `/api/kpi/overview`. Otherwise it falls back to the existing `window.MERIDIAN.*` mock data so the demo path stays intact.

Rather than replacing every individual chart, introduce one resource hook at the top of the page component:

- [ ] **Step 1: Add a small hook above the page component**

In `src/pages/overview.jsx`, near the top:

```jsx
function useOverviewData() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.live) {
      setData({
        totalSpendUsd:   window.MERIDIAN.KPI.totalSpend,
        totalRequests:   window.MERIDIAN.KPI.totalRequests,
        estimatedSavingsUsd: window.MERIDIAN.KPI.savings,
        dailySpend:      window.MERIDIAN.KPI.dailySeries || [],
        teamSpend:       window.MERIDIAN.TEAMS || [],
        modelMix:        window.MERIDIAN.MODELS || [],
      });
      return;
    }
    let alive = true;
    window.MeridianAPI.kpi.overview()
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, []);
  return { data, error };
}
```

- [ ] **Step 2: Replace the data reads in the page body**

Wherever the page currently reads `window.MERIDIAN.KPI.totalSpend` etc., read from `data.totalSpendUsd` etc. Add a one-line loading state at the top of the return:

```jsx
const { data, error } = useOverviewData();
if (error)  return <div className="meridian-error">{error.message}</div>;
if (!data)  return <div className="meridian-loading">Loading…</div>;
```

(The exact field renaming map: `totalSpend` → `totalSpendUsd`, `totalRequests` → `totalRequests`, `savings` → `estimatedSavingsUsd`, `dailySeries` → `dailySpend`, `MODELS` → `modelMix`, `TEAMS` → `teamSpend`. If the page references additional fields, leave them on `window.MERIDIAN` for now — the demo data shape is the contract.)

- [ ] **Step 3: Manual smoke**

```bash
npm run start:api
# in another shell
node scripts/seed-demo.js
```

In the browser, open the dashboard at `http://localhost:5500`, log in as `demo@meridian.local / demo123demo`, then in the JS console:

```js
window.MERIDIAN_LIVE = true; location.reload();
```

The Overview KPIs should now reflect the seeded data, not the mock numbers.

- [ ] **Step 4: Commit**

```bash
git add src/pages/overview.jsx
git commit -m "feat(overview): live data via MeridianAPI when MERIDIAN_LIVE=true"
```

---

### Task 16: Wire Logs + Feed pages

**Files:**
- Modify: `src/pages/logs.jsx`, `src/pages/feed.jsx`

Same pattern as Task 15. Each page gets a `useResource()` hook that calls `MeridianAPI.requests.list({...})` or `MeridianAPI.kpi.feed()` in live mode and falls back to demo data otherwise.

- [ ] **Step 1: Logs page hook**

```jsx
function useLogs(filters) {
  const [out, setOut] = React.useState({ requests: window.MERIDIAN.REQUEST_LOGS || [], total: (window.MERIDIAN.REQUEST_LOGS || []).length });
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.live) return;
    let alive = true;
    window.MeridianAPI.requests.list(filters)
      .then(d => { if (alive) setOut({ requests: d.requests, total: d.total }); })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [JSON.stringify(filters)]);
  return { ...out, error };
}
```

Wire it into the existing table component, mapping fields: `model`, `provider`, `status`, `latencyMs`, `costUsd`, `promptTokens`, `completionTokens`, `timestamp`.

- [ ] **Step 2: Feed page hook + 5-second poller**

```jsx
function useFeed() {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    function tick() {
      if (!window.MeridianAPI || !window.MeridianAPI.live) {
        // Fall back to mock counters; keep ticking so the demo feels alive.
        setData({
          requestsPerMinute: window.MERIDIAN.KPI.rpm || 0,
          tokensPerSecond:  window.MERIDIAN.KPI.tps || 0,
          costPerHourUsd:   window.MERIDIAN.KPI.costPerHour || 0,
          recent: (window.MERIDIAN.REQUEST_LOGS || []).slice(0, 50),
        });
        return;
      }
      window.MeridianAPI.kpi.feed().then(d => { if (alive) setData(d); }).catch(() => {});
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return data;
}
```

- [ ] **Step 3: Manual smoke + commit**

After verifying both pages render correctly in live mode:

```bash
git add src/pages/logs.jsx src/pages/feed.jsx
git commit -m "feat(frontend): live logs + feed via MeridianAPI"
```

---

### Task 17: Wire Keys, Alerts, Agents pages

**Files:**
- Modify: `src/pages/keys.jsx`, `src/pages/alerts.jsx`, `src/pages/agents.jsx`

Each page replaces `window.MERIDIAN.VIRTUAL_KEYS` / `ALERTS` / `AGENTS` with `MeridianAPI.*.list()` in live mode and gains a create form that calls the matching `MeridianAPI.*.create()` then re-fetches. The hook used in Task 15 / 16 generalizes to any list resource — this task uses one shared helper.

- [ ] **Step 1: Add a shared list-resource hook**

In `src/core/api.jsx`, append to the IIFE before `window.MeridianAPI = API`:

```jsx
  API.useList = function useList(loader, fallback) {
    const [items, setItems] = React.useState(fallback);
    const [error, setError] = React.useState(null);
    const [version, setVersion] = React.useState(0);
    React.useEffect(() => {
      if (!API.live) { setItems(fallback); return; }
      let alive = true;
      loader()
        .then(d => { if (alive) setItems(d); })
        .catch(e => { if (alive) setError(e); });
      return () => { alive = false; };
    }, [version, API.live]);
    return { items, error, refresh: () => setVersion(v => v + 1) };
  };
```

(`fallback` is the demo-mode value; the hook also re-fetches when `refresh()` is called so create/delete can refresh without a page reload.)

- [ ] **Step 2: Keys page (`src/pages/keys.jsx`)**

Replace the existing data read with:

```jsx
const { items: keysData, error, refresh } = window.MeridianAPI.useList(
  () => window.MeridianAPI.virtualKeys.list(),
  { keys: window.MERIDIAN.VIRTUAL_KEYS || [] }
);
const keys = keysData ? keysData.keys || keysData : [];

const [revealed, setRevealed] = React.useState(null);   // { secret, prefix } shown once after create

async function createKey(form) {
  if (!window.MeridianAPI.live) {
    // demo: append to in-memory list
    window.MERIDIAN.VIRTUAL_KEYS.push({ id: Date.now(), prefix: 'mk_demo', label: form.label, status: 'active', spentMtdUsd: 0, monthlyBudgetUsd: form.monthlyBudgetUsd });
    refresh();
    return;
  }
  const r = await window.MeridianAPI.virtualKeys.create(form);
  setRevealed({ secret: r.secret, prefix: r.key.prefix });    // shown once
  refresh();
}

async function deleteKey(id) {
  if (!window.MeridianAPI.live) {
    window.MERIDIAN.VIRTUAL_KEYS = window.MERIDIAN.VIRTUAL_KEYS.filter(k => k.id !== id);
    refresh(); return;
  }
  await window.MeridianAPI.virtualKeys.delete(id);
  refresh();
}
```

The `revealed` modal must show the full secret with a Copy button and the text **"This is the only time this secret will be shown. Copy it now."** Do not log the secret. Do not persist it in localStorage. Setting `revealed` to `null` clears it from React state.

- [ ] **Step 3: Alerts page (`src/pages/alerts.jsx`)**

```jsx
const { items, error, refresh } = window.MeridianAPI.useList(
  () => window.MeridianAPI.alerts.list(),
  { alerts: window.MERIDIAN.ALERTS || [] }
);
const alerts = items ? items.alerts || items : [];

async function createAlert(form) {
  // form shape: { name, type, target?, thresholdUsd?, thresholdRpm?, windowMinutes? }
  if (!window.MeridianAPI.live) {
    window.MERIDIAN.ALERTS.push({ id: Date.now(), state: 'active', ...form });
    refresh(); return;
  }
  await window.MeridianAPI.alerts.create(form);
  refresh();
}

async function toggleAlert(id, currentState) {
  const next = currentState === 'paused' ? 'active' : 'paused';
  if (!window.MeridianAPI.live) {
    const a = window.MERIDIAN.ALERTS.find(a => a.id === id); if (a) a.state = next;
    refresh(); return;
  }
  await window.MeridianAPI.alerts.update(id, { state: next });
  refresh();
}
```

Render four create-form variants conditional on the selected type (`team_budget` needs `target.teamId` + `thresholdUsd`; `key_budget` needs `target.virtualKeyId` + `thresholdUsd`; `spike` needs `thresholdRpm` + `windowMinutes`; `agent_loop` needs `target.agentId`).

- [ ] **Step 4: Agents page (`src/pages/agents.jsx`)**

```jsx
const { items, error, refresh } = window.MeridianAPI.useList(
  () => window.MeridianAPI.agents.list(),
  { agents: window.MERIDIAN.AGENTS || [] }
);
const agents = items ? items.agents || items : [];

async function startRun(agentId) {
  if (!window.MeridianAPI.live) return;            // demo: noop
  await window.MeridianAPI.agents.startRun(agentId);
  refresh();
}

function AgentRuns({ agentId }) {
  const [runs, setRuns] = React.useState([]);
  React.useEffect(() => {
    if (!window.MeridianAPI.live) {
      setRuns(window.MERIDIAN.AGENT_RUNS_BY_AGENT?.[agentId] || []);
      return;
    }
    let alive = true;
    window.MeridianAPI.agents.runs(agentId).then(d => { if (alive) setRuns(d.runs); });
    return () => { alive = false; };
  }, [agentId]);
  return runs.map(r => (
    <div key={r.id} className="agent-run-row">
      <span>{r.startedAt}</span> · <span>{r.requestCount} reqs</span> · <span>${r.costUsd.toFixed(4)}</span> · <span>{r.status}</span>
    </div>
  ));
}
```

- [ ] **Step 5: Manual smoke + commit**

After verifying each page in the browser (live + demo modes):

```bash
git add src/core/api.jsx src/pages/keys.jsx src/pages/alerts.jsx src/pages/agents.jsx
git commit -m "feat(frontend): live keys + alerts + agents via MeridianAPI"
```

---

### Task 18: Onboarding wiring (provider keys)

**Files:**
- Modify: `src/pages/onboarding.jsx`

The onboarding wizard already has fields for OpenAI/Anthropic/Google/Azure keys. Today it writes to local state. In live mode, each form submit must `POST /api/provider-keys`.

- [ ] **Step 1: Replace the in-memory submit with the API call**

```jsx
async function saveProviderKey(provider, apiKey, label) {
  if (!window.MeridianAPI || !window.MeridianAPI.live) {
    // demo path: keep the existing in-memory behavior
    return;
  }
  await window.MeridianAPI.providerKeys.create({ provider, apiKey, label });
}
```

Wire `saveProviderKey` into each connector's submit handler. On success, advance to the next step or close the wizard.

- [ ] **Step 2: Manual smoke + commit**

```bash
git add src/pages/onboarding.jsx
git commit -m "feat(onboarding): persist provider keys via API in live mode"
```

---

### Task 19: README + PLAN updates, final smoke test

**Files:**
- Modify: `README.md`
- Modify: `PLAN.md`
- Create: `scripts/smoke-api.sh`

- [ ] **Step 1: Update README.md**

Add a "Run with the live backend" section under "Quick start" that documents:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # paste into JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # paste into ENCRYPTION_KEY
npm install
npm run doctor                    # verify env + store
npm run seed:demo                 # optional: populate demo data
npm run start:api                 # http://localhost:5500
```

Then in the browser console: `window.MERIDIAN_LIVE = true; location.reload();`

Also document the new endpoint surface at a high level (no full schema — link to `docs/superpowers/plans/2026-05-07-backend-mvp.md`).

- [ ] **Step 2: Tick off milestones in PLAN.md**

Mark M3 (Operational backend) tasks as `[x]` for the domains we shipped: requests, agents, alerts, virtualKeys, teams. Leave Supabase migration (M2), OTP (M1 partial), and ML router (M4) as `[ ]`.

Add a decision log entry:

```
- 2026-05-07 — Shipped backend MVP: per-request log, virtual keys with bcrypt-hashed secrets, budget engine, alert engine, agents/runs, KPI aggregation. Frontend reads from MeridianAPI when MERIDIAN_LIVE=true; demo path unchanged.
```

- [ ] **Step 3: Smoke script**

```bash
#!/usr/bin/env bash
# scripts/smoke-api.sh — exercises the backend end-to-end against a running server.
set -euo pipefail
BASE="${BASE:-http://localhost:5500}"
EMAIL="smoke-$(date +%s)@example.com"
PASS="longenough12345"
COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

curl -fsS -c "$COOKIE" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/auth/signup" >/dev/null

PK_ID=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
  -d '{"provider":"openai","apiKey":"sk-1234567890","label":"smoke"}' \
  "$BASE/api/provider-keys" | node -e 'process.stdin.once("data",d=>console.log(JSON.parse(d).key.id))')

VK_RESP=$(curl -fsS -b "$COOKIE" -c "$COOKIE" -H 'content-type: application/json' \
  -d "{\"providerKeyId\":$PK_ID,\"label\":\"smoke\"}" "$BASE/api/virtual-keys")
SECRET=$(node -e "console.log(JSON.parse(\`$VK_RESP\`).secret)")

curl -fsS -H "X-Meridian-Key: $SECRET" -H 'content-type: application/json' \
  -d '{"provider":"openai","model":"gpt-4.1-mini","promptTokens":100,"completionTokens":100,"status":"ok"}' \
  "$BASE/api/v1/requests" >/dev/null

KPI=$(curl -fsS -b "$COOKIE" "$BASE/api/kpi/overview")
echo "$KPI" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); if(d.totalRequests!==1)throw new Error("expected 1 request, got "+d.totalRequests); console.log("smoke ok:",d);'
```

```bash
chmod +x scripts/smoke-api.sh
```

- [ ] **Step 4: Run the full suite + smoke**

```bash
npm test
npm run start:api &
sleep 1
./scripts/smoke-api.sh
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add README.md PLAN.md scripts/smoke-api.sh
git commit -m "docs: backend MVP runbook + end-to-end smoke script"
```

---

## Spec coverage checklist

Skim of the implicit spec (= every page in the frontend reads from API):

| Page                | Endpoint                                    | Task |
|---------------------|---------------------------------------------|------|
| Overview            | `GET /api/kpi/overview`                     | 10, 15 |
| Feed                | `GET /api/kpi/feed`                         | 10, 16 |
| Logs                | `GET /api/requests`                         | 9, 16 |
| Agents              | `GET /api/agents`, `…/runs`                 | 12, 17 |
| Keys                | `GET/POST/PUT/DELETE /api/virtual-keys`     | 7, 17 |
| Alerts              | `GET/POST/PUT/DELETE /api/alerts`           | 11, 17 |
| Onboarding          | `POST /api/provider-keys`                   | 3, 18 |

Cross-cutting:
- Auth — Task 3
- Audit log — Task 4
- Pricing — Task 6
- Budget engine — Task 8
- Alert engine — Task 11
- Doctor + seed — Task 13
- Smoke + docs — Task 19

## Out of scope (intentional)

- Supabase migration (PLAN.md M2)
- OTP / forgot-password (PLAN.md M1 remainder)
- ML cost-router integration (PLAN.md M4)
- Tightened CSP + Vite production bundle (PLAN.md M6)
- Per-team RBAC, multi-tenant orgs
- Real provider proxy ingestion (the `/api/proxy/*` endpoints stay as today's stubs; ingestion uses `POST /api/v1/requests` from any client/SDK)

## Risk register

- **JSON store + many requests.** ~50k rows is the rough comfort ceiling; past that, plan ahead for the Supabase migration. Mitigation: monitor file size in `scripts/doctor.js`.
- **Virtual key prefix collisions.** 6 base62 chars give 56B prefixes; collision is irrelevant in practice but the bcrypt loop in `authByVirtualKey` does scan all keys with the same prefix. Mitigation: indexed lookup will land naturally with Supabase.
- **Alert engine on hot path.** Synchronous in-process — fine for MVP traffic. If ingest exceeds ~50 rps the alert scan becomes a bottleneck; move to a background worker in M3+.
- **Pricing drift.** The hard-coded table will go stale. Mitigation: pull pricing into a JSON file with a "last verified" date and add a doctor check.

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
      // Link a Supabase user to a local user, creating one if needed.
      // Match by email first (auto-link); if no match, insert a new user with the
      // supabaseUserId set and no passwordHash.
      findOrCreateBySupabase: ({ supabaseUserId, email, name, avatarUrl }) => {
        const em = String(email).toLowerCase();
        let u = data.users.find(u => u.email.toLowerCase() === em);
        if (u) {
          let dirty = false;
          if (!u.supabaseUserId)             { u.supabaseUserId = supabaseUserId; dirty = true; }
          if (name && u.name !== name)        { u.name = name; dirty = true; }
          if (avatarUrl && u.avatarUrl !== avatarUrl) { u.avatarUrl = avatarUrl; dirty = true; }
          if (dirty) persist();
          return wrap(u);
        }
        u = {
          id: data.nextUserId++,
          email: String(email),
          passwordHash: null,
          supabaseUserId: String(supabaseUserId),
          name: name || null,
          avatarUrl: avatarUrl || null,
          createdAt: nowIso(),
        };
        data.users.push(u);
        persist();
        return wrap(u);
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

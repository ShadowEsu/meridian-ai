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
    agents: notImplemented('agents'),
    agentRuns: notImplemented('agentRuns'),
    alerts: notImplemented('alerts'),
    requests: notImplemented('requests'),
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

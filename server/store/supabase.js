'use strict';

// Supabase store — same interface as ./json.js, backed by Postgres.
// Uses @supabase/supabase-js with the SERVICE ROLE KEY so it bypasses RLS.
// Application code enforces user_id scoping; RLS is defense-in-depth.
//
// Schema lives in schema/000_init.sql — apply once via the Supabase SQL
// editor before flipping MERIDIAN_STORE=supabase.

const { createClient } = require('@supabase/supabase-js');

function nowIso() { return new Date().toISOString(); }

// snake_case (Postgres) ↔ camelCase (JS) mappers per table. Keeps the
// rest of the server code provider-agnostic.
const MAP = {
  users: {
    toRow: (r) => ({ id: r.id, email: r.email, passwordHash: r.password_hash,
                     supabaseUserId: r.supabase_user_id, name: r.name,
                     avatarUrl: r.avatar_url, createdAt: r.created_at }),
    toDb:  (o) => stripUndefined({
      email: o.email, password_hash: o.passwordHash,
      supabase_user_id: o.supabaseUserId, name: o.name, avatar_url: o.avatarUrl,
    }),
  },
  providerKeys: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, provider: r.provider, label: r.label,
                     prefix: r.prefix, encryptedKey: r.encrypted_key, iv: r.iv,
                     authTag: r.auth_tag, createdAt: r.created_at }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, provider: o.provider, label: o.label, prefix: o.prefix,
      encrypted_key: o.encryptedKey, iv: o.iv, auth_tag: o.authTag,
    }),
  },
  teams: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, name: r.name,
                     monthlyBudgetUsd: r.monthly_budget_usd, createdAt: r.created_at }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, name: o.name, monthly_budget_usd: o.monthlyBudgetUsd,
    }),
  },
  virtualKeys: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, teamId: r.team_id,
                     providerKeyId: r.provider_key_id, label: r.label,
                     prefix: r.prefix, keyHash: r.key_hash,
                     monthlyBudgetUsd: r.monthly_budget_usd, status: r.status,
                     spentMtdUsd: Number(r.spent_mtd_usd) || 0,
                     lastUsedAt: r.last_used_at, createdAt: r.created_at }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, team_id: o.teamId, provider_key_id: o.providerKeyId,
      label: o.label, prefix: o.prefix, key_hash: o.keyHash,
      monthly_budget_usd: o.monthlyBudgetUsd, status: o.status,
      spent_mtd_usd: o.spentMtdUsd, last_used_at: o.lastUsedAt,
    }),
  },
  agents: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, teamId: r.team_id,
                     name: r.name, description: r.description, status: r.status,
                     maxRunCostUsd: r.max_run_cost_usd,
                     maxLoopIterations: r.max_loop_iterations,
                     createdAt: r.created_at }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, team_id: o.teamId, name: o.name, description: o.description,
      status: o.status, max_run_cost_usd: o.maxRunCostUsd,
      max_loop_iterations: o.maxLoopIterations,
    }),
  },
  agentRuns: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, agentId: r.agent_id,
                     startedAt: r.started_at, endedAt: r.ended_at,
                     status: r.status, requestCount: r.request_count,
                     costUsd: Number(r.cost_usd) || 0,
                     iterationCount: r.iteration_count,
                     lastRequestId: r.last_request_id }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, agent_id: o.agentId, started_at: o.startedAt,
      ended_at: o.endedAt, status: o.status, request_count: o.requestCount,
      cost_usd: o.costUsd, iteration_count: o.iterationCount,
      last_request_id: o.lastRequestId,
    }),
  },
  alerts: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, name: r.name, type: r.type,
                     target: r.target, thresholdUsd: r.threshold_usd,
                     thresholdRpm: r.threshold_rpm, windowMinutes: r.window_minutes,
                     state: r.state, lastTriggeredAt: r.last_triggered_at,
                     createdAt: r.created_at }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, name: o.name, type: o.type, target: o.target,
      threshold_usd: o.thresholdUsd, threshold_rpm: o.thresholdRpm,
      window_minutes: o.windowMinutes, state: o.state,
      last_triggered_at: o.lastTriggeredAt,
    }),
  },
  requests: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, virtualKeyId: r.virtual_key_id,
                     teamId: r.team_id, agentId: r.agent_id, provider: r.provider,
                     model: r.model, promptTokens: r.prompt_tokens,
                     completionTokens: r.completion_tokens, latencyMs: r.latency_ms,
                     costUsd: Number(r.cost_usd) || 0, status: r.status,
                     taskType: r.task_type, timestamp: r.timestamp }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, virtual_key_id: o.virtualKeyId, team_id: o.teamId,
      agent_id: o.agentId, provider: o.provider, model: o.model,
      prompt_tokens: o.promptTokens, completion_tokens: o.completionTokens,
      latency_ms: o.latencyMs, cost_usd: o.costUsd, status: o.status,
      task_type: o.taskType, timestamp: o.timestamp,
    }),
  },
  auditLog: {
    toRow: (r) => ({ id: r.id, userId: r.user_id, action: r.action,
                     target: r.target, meta: r.meta, ip: r.ip,
                     timestamp: r.timestamp }),
    toDb:  (o) => stripUndefined({
      user_id: o.userId, action: o.action, target: o.target, meta: o.meta, ip: o.ip,
    }),
  },
};

function stripUndefined(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

function unwrap(promise, mapFn) {
  return promise.then(({ data, error }) => {
    if (error) {
      const e = new Error(error.message);
      e.code = error.code; e.details = error.details;
      throw e;
    }
    if (data == null) return null;
    if (Array.isArray(data)) return mapFn ? data.map(mapFn) : data;
    return mapFn ? mapFn(data) : data;
  });
}

function createSupabaseStore(opts = {}) {
  const url = opts.url || process.env.SUPABASE_URL;
  const key = opts.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Supabase store requires SUPABASE_URL');
  if (!key) throw new Error('Supabase store requires SUPABASE_SERVICE_ROLE_KEY');

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const T = {
    users:        'meridian_users',
    providerKeys: 'meridian_provider_keys',
    teams:        'meridian_teams',
    virtualKeys:  'meridian_virtual_keys',
    agents:       'meridian_agents',
    agentRuns:    'meridian_agent_runs',
    alerts:       'meridian_alerts',
    requests:     'meridian_requests',
    auditLog:     'meridian_audit_log',
  };

  return {
    kind: 'supabase',
    _client: sb,

    /* ───────────── USERS ───────────── */
    users: {
      all: () => unwrap(sb.from(T.users).select('*'), MAP.users.toRow),
      add: ({ email, passwordHash }) => unwrap(
        sb.from(T.users).insert(MAP.users.toDb({ email, passwordHash })).select().single(),
        MAP.users.toRow
      ).catch(e => {
        if (e.code === '23505') { const x = new Error('duplicate email'); x.code = 'DUPLICATE_EMAIL'; throw x; }
        throw e;
      }),
      findByEmail: (email) => unwrap(
        sb.from(T.users).select('*').ilike('email', email).maybeSingle(),
        MAP.users.toRow
      ),
      findById: (id) => unwrap(
        sb.from(T.users).select('*').eq('id', Number(id)).maybeSingle(),
        MAP.users.toRow
      ),
      updatePassword: async (id, passwordHash) => {
        const { error } = await sb.from(T.users).update({ password_hash: passwordHash }).eq('id', Number(id));
        return !error;
      },
      findOrCreateBySupabase: async ({ supabaseUserId, email, name, avatarUrl }) => {
        const existing = await unwrap(
          sb.from(T.users).select('*').ilike('email', email).maybeSingle(),
          MAP.users.toRow
        );
        if (existing) {
          const patch = {};
          if (!existing.supabaseUserId) patch.supabase_user_id = supabaseUserId;
          if (name && existing.name !== name) patch.name = name;
          if (avatarUrl && existing.avatarUrl !== avatarUrl) patch.avatar_url = avatarUrl;
          if (Object.keys(patch).length === 0) return existing;
          return unwrap(
            sb.from(T.users).update(patch).eq('id', existing.id).select().single(),
            MAP.users.toRow
          );
        }
        return unwrap(
          sb.from(T.users).insert(MAP.users.toDb({
            email, supabaseUserId, name, avatarUrl,
          })).select().single(),
          MAP.users.toRow
        );
      },
    },

    /* ───────────── PROVIDER KEYS ───────────── */
    providerKeys: {
      add: (userId, row) => unwrap(
        sb.from(T.providerKeys).insert(MAP.providerKeys.toDb({ ...row, userId })).select().single(),
        MAP.providerKeys.toRow
      ),
      list: (userId) => unwrap(
        sb.from(T.providerKeys).select('*').eq('user_id', Number(userId)).order('id', { ascending: false }),
        MAP.providerKeys.toRow
      ),
      get: (userId, id) => unwrap(
        sb.from(T.providerKeys).select('*').eq('user_id', Number(userId)).eq('id', Number(id)).maybeSingle(),
        MAP.providerKeys.toRow
      ),
      delete: async (userId, id) => {
        const { error, count } = await sb.from(T.providerKeys)
          .delete({ count: 'exact' }).eq('user_id', Number(userId)).eq('id', Number(id));
        if (error) throw error;
        return count > 0;
      },
      latestForProvider: (userId, provider) => unwrap(
        sb.from(T.providerKeys).select('*')
          .eq('user_id', Number(userId)).eq('provider', provider)
          .order('id', { ascending: false }).limit(1).maybeSingle(),
        MAP.providerKeys.toRow
      ),
    },

    /* ───────────── TEAMS ───────────── */
    teams: {
      list: (userId) => unwrap(
        sb.from(T.teams).select('*').eq('user_id', Number(userId)).order('id'),
        MAP.teams.toRow
      ),
      get: (userId, id) => unwrap(
        sb.from(T.teams).select('*').eq('user_id', Number(userId)).eq('id', Number(id)).maybeSingle(),
        MAP.teams.toRow
      ),
      add: (userId, { name, monthlyBudgetUsd }) => unwrap(
        sb.from(T.teams).insert(MAP.teams.toDb({ userId, name, monthlyBudgetUsd })).select().single(),
        MAP.teams.toRow
      ),
      update: (userId, id, patch) => unwrap(
        sb.from(T.teams).update(MAP.teams.toDb(patch))
          .eq('user_id', Number(userId)).eq('id', Number(id))
          .select().maybeSingle(),
        MAP.teams.toRow
      ),
      delete: async (userId, id) => {
        const { error, count } = await sb.from(T.teams)
          .delete({ count: 'exact' }).eq('user_id', Number(userId)).eq('id', Number(id));
        if (error) throw error;
        return count > 0;
      },
    },

    /* ───────────── VIRTUAL KEYS ───────────── */
    virtualKeys: {
      list: (userId) => unwrap(
        sb.from(T.virtualKeys).select('*').eq('user_id', Number(userId)).order('id', { ascending: false }),
        MAP.virtualKeys.toRow
      ),
      get: (userId, id) => unwrap(
        sb.from(T.virtualKeys).select('*').eq('user_id', Number(userId)).eq('id', Number(id)).maybeSingle(),
        MAP.virtualKeys.toRow
      ),
      add: (userId, row) => unwrap(
        sb.from(T.virtualKeys).insert(MAP.virtualKeys.toDb({ ...row, userId })).select().single(),
        MAP.virtualKeys.toRow
      ),
      update: (userId, id, patch) => unwrap(
        sb.from(T.virtualKeys).update(MAP.virtualKeys.toDb(patch))
          .eq('user_id', Number(userId)).eq('id', Number(id))
          .select().maybeSingle(),
        MAP.virtualKeys.toRow
      ),
      delete: async (userId, id) => {
        const { error, count } = await sb.from(T.virtualKeys)
          .delete({ count: 'exact' }).eq('user_id', Number(userId)).eq('id', Number(id));
        if (error) throw error;
        return count > 0;
      },
      findByPrefix: (prefix) => unwrap(
        sb.from(T.virtualKeys).select('*').eq('prefix', String(prefix)).eq('status', 'active'),
        MAP.virtualKeys.toRow
      ),
      recordSpend: async (id, deltaUsd) => {
        // No atomic UPDATE…RETURNING via supabase-js; do read-modify-write.
        // For high contention move to a Postgres function (rpc).
        const cur = await unwrap(
          sb.from(T.virtualKeys).select('*').eq('id', Number(id)).maybeSingle(),
          MAP.virtualKeys.toRow
        );
        if (!cur) return null;
        return unwrap(
          sb.from(T.virtualKeys).update({
            spent_mtd_usd: (cur.spentMtdUsd || 0) + Number(deltaUsd || 0),
            last_used_at: nowIso(),
          }).eq('id', Number(id)).select().maybeSingle(),
          MAP.virtualKeys.toRow
        );
      },
      resetMtd: async () => {
        const { error } = await sb.from(T.virtualKeys).update({ spent_mtd_usd: 0 }).neq('id', 0);
        if (error) throw error;
        return true;
      },
    },

    /* ───────────── AGENTS ───────────── */
    agents: {
      list: (userId) => unwrap(
        sb.from(T.agents).select('*').eq('user_id', Number(userId)).order('id', { ascending: false }),
        MAP.agents.toRow
      ),
      get: (userId, id) => unwrap(
        sb.from(T.agents).select('*').eq('user_id', Number(userId)).eq('id', Number(id)).maybeSingle(),
        MAP.agents.toRow
      ),
      add: (userId, row) => unwrap(
        sb.from(T.agents).insert(MAP.agents.toDb({ ...row, userId })).select().single(),
        MAP.agents.toRow
      ),
      update: (userId, id, patch) => unwrap(
        sb.from(T.agents).update(MAP.agents.toDb(patch))
          .eq('user_id', Number(userId)).eq('id', Number(id))
          .select().maybeSingle(),
        MAP.agents.toRow
      ),
      delete: async (userId, id) => {
        const { error, count } = await sb.from(T.agents)
          .delete({ count: 'exact' }).eq('user_id', Number(userId)).eq('id', Number(id));
        if (error) throw error;
        return count > 0;
      },
    },
    agentRuns: {
      list: (userId, agentId) => unwrap(
        sb.from(T.agentRuns).select('*')
          .eq('user_id', Number(userId)).eq('agent_id', Number(agentId))
          .order('id', { ascending: false }),
        MAP.agentRuns.toRow
      ),
      add: (userId, agentId, row) => unwrap(
        sb.from(T.agentRuns).insert(MAP.agentRuns.toDb({
          userId, agentId,
          startedAt: row.startedAt || nowIso(),
          endedAt: row.endedAt || null,
          status: row.status || 'running',
        })).select().single(),
        MAP.agentRuns.toRow
      ),
      patch: (id, patch) => unwrap(
        sb.from(T.agentRuns).update(MAP.agentRuns.toDb(patch))
          .eq('id', Number(id)).select().maybeSingle(),
        MAP.agentRuns.toRow
      ),
    },

    /* ───────────── ALERTS ───────────── */
    alerts: {
      list: (userId) => unwrap(
        sb.from(T.alerts).select('*').eq('user_id', Number(userId)).order('id', { ascending: false }),
        MAP.alerts.toRow
      ),
      add: (userId, row) => unwrap(
        sb.from(T.alerts).insert(MAP.alerts.toDb({ ...row, userId })).select().single(),
        MAP.alerts.toRow
      ),
      update: (userId, id, patch) => unwrap(
        sb.from(T.alerts).update(MAP.alerts.toDb(patch))
          .eq('user_id', Number(userId)).eq('id', Number(id))
          .select().maybeSingle(),
        MAP.alerts.toRow
      ),
      delete: async (userId, id) => {
        const { error, count } = await sb.from(T.alerts)
          .delete({ count: 'exact' }).eq('user_id', Number(userId)).eq('id', Number(id));
        if (error) throw error;
        return count > 0;
      },
      setTriggered: (id, when = nowIso()) => unwrap(
        sb.from(T.alerts).update({ state: 'triggered', last_triggered_at: when })
          .eq('id', Number(id)).select().maybeSingle(),
        MAP.alerts.toRow
      ),
      forUser: async (userId, predicate) => {
        const all = await unwrap(
          sb.from(T.alerts).select('*').eq('user_id', Number(userId)).eq('state', 'active'),
          MAP.alerts.toRow
        );
        return all.filter(predicate);
      },
    },

    /* ───────────── REQUESTS ───────────── */
    requests: {
      add: (row) => unwrap(
        sb.from(T.requests).insert(MAP.requests.toDb({
          ...row,
          timestamp: row.timestamp || nowIso(),
        })).select().single(),
        MAP.requests.toRow
      ),
      query: async ({ userId, from, to, teamId, virtualKeyId, agentId, status, page = 1, limit = 50 }) => {
        let q = sb.from(T.requests).select('*', { count: 'exact' })
          .eq('user_id', Number(userId))
          .order('id', { ascending: false });
        if (from)         q = q.gte('timestamp', from);
        if (to)           q = q.lte('timestamp', to);
        if (teamId)       q = q.eq('team_id', Number(teamId));
        if (virtualKeyId) q = q.eq('virtual_key_id', Number(virtualKeyId));
        if (agentId)      q = q.eq('agent_id', Number(agentId));
        if (status)       q = q.eq('status', status);
        const lim = Math.max(1, Math.min(500, Number(limit) || 50));
        const pg  = Math.max(1, Number(page) || 1);
        const start = (pg - 1) * lim;
        q = q.range(start, start + lim - 1);
        const { data, error, count } = await q;
        if (error) throw error;
        return { rows: (data || []).map(MAP.requests.toRow), page: pg, limit: lim, total: count || 0 };
      },
      recentForKey: (userId, virtualKeyId, since) => unwrap(
        sb.from(T.requests).select('*')
          .eq('user_id', Number(userId))
          .eq('virtual_key_id', Number(virtualKeyId))
          .gte('timestamp', since),
        MAP.requests.toRow
      ),
      countSince: async (userId, since) => {
        const { count, error } = await sb.from(T.requests)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', Number(userId)).gte('timestamp', since);
        if (error) throw error;
        return count || 0;
      },
      totalsSince: async (userId, since) => {
        const { data, error } = await sb.from(T.requests)
          .select('cost_usd, prompt_tokens, completion_tokens')
          .eq('user_id', Number(userId)).gte('timestamp', since);
        if (error) throw error;
        const tot = { count: data.length, costUsd: 0, promptTokens: 0, completionTokens: 0 };
        for (const r of data) {
          tot.costUsd          += Number(r.cost_usd) || 0;
          tot.promptTokens     += r.prompt_tokens || 0;
          tot.completionTokens += r.completion_tokens || 0;
        }
        return tot;
      },
    },

    /* ───────────── AUDIT LOG ───────────── */
    auditLog: {
      append: ({ userId, action, target, meta, ip }) => unwrap(
        sb.from(T.auditLog).insert(MAP.auditLog.toDb({
          userId, action, target, meta, ip,
        })).select().single(),
        MAP.auditLog.toRow
      ),
      list: ({ userId, limit = 100 } = {}) => {
        let q = sb.from(T.auditLog).select('*').order('id', { ascending: false })
          .limit(Math.max(1, Math.min(1000, Number(limit) || 100)));
        if (userId != null) q = q.eq('user_id', Number(userId));
        return unwrap(q, MAP.auditLog.toRow);
      },
    },
  };
}

module.exports = { createSupabaseStore };

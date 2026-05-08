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

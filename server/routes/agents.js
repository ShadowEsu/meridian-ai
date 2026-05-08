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

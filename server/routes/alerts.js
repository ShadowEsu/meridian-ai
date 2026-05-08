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

/**
 * Register alert CRUD routes.
 *
 * @param {import('express').Application} app
 * @param {{ store: object, audit: object }} ctx
 */
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

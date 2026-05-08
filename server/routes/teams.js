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

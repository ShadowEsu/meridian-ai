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

'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { userWriteLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { encryptSecret } = require('../crypto-secret');
const { jsonError } = require('../lib/errors');

function safeText(s, max = 200) {
  return String(s || '').replace(/[ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
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

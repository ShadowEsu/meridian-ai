'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { proxyLimiter } = require('../lib/rate-limiters');
const { requireUser } = require('../auth-middleware');
const { decryptSecret } = require('../crypto-secret');

async function getDecryptedKey(store, userId, provider) {
  const row = await store.providerKeys.latestForProvider(userId, provider);
  if (!row) return null;
  return decryptSecret({ iv: row.iv, ciphertext: row.ciphertext, authTag: row.authTag });
}

function register(app, { store }) {
  app.post(
    '/api/proxy/anthropic/v1/messages',
    requireUser,
    proxyLimiter,
    validate(z.object({
      body: z.object({
        model: z.string().min(1).max(120),
        messages: z.array(z.object({
          role: z.string().min(1).max(32),
          content: z.any(),
        })).min(1).max(200),
        max_tokens: z.number().int().positive().max(8192).optional(),
      }).passthrough(),
    })),
    async (req, res) => {
    const apiKey = await getDecryptedKey(store, req.user.id, 'anthropic');
    if (!apiKey) {
      return res.status(400).json({ error: 'No Anthropic API key on file.' });
    }
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req.body),
      });
      const text = await r.text();
      res.status(r.status);
      try {
        res.json(JSON.parse(text));
      } catch {
        res.type('text').send(text);
      }
    } catch (e) {
      res.status(502).json({ error: 'Upstream request failed', detail: String(e.message) });
    }
  });

  app.post(
    '/api/proxy/openai/v1/chat/completions',
    requireUser,
    proxyLimiter,
    validate(z.object({
      body: z.object({
        model: z.string().min(1).max(120),
        messages: z.array(z.object({
          role: z.string().min(1).max(32),
          content: z.any(),
        })).min(1).max(200),
        max_tokens: z.number().int().positive().max(8192).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }).passthrough(),
    })),
    async (req, res) => {
    const apiKey = await getDecryptedKey(store, req.user.id, 'openai');
    if (!apiKey) {
      return res.status(400).json({ error: 'No OpenAI API key on file.' });
    }
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body),
      });
      const text = await r.text();
      res.status(r.status);
      try {
        res.json(JSON.parse(text));
      } catch {
        res.type('text').send(text);
      }
    } catch (e) {
      res.status(502).json({ error: 'Upstream request failed', detail: String(e.message) });
    }
  });
}

module.exports = { register };

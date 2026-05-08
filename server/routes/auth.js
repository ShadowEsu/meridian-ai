'use strict';
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { authLimiter } = require('../lib/rate-limiters');
const { signSession, clearSession, readUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function register(app, { store, audit }) {
  app.post(
    '/api/auth/signup',
    authLimiter,
    validate(z.object({
      body: z.object({
        email: z.string().min(3).max(254).transform(normalizeEmail),
        password: z.string().min(8).max(256),
      }).strict(),
    })),
    async (req, res) => {
      try {
        const { email, password } = req.validated.body;
        if (!email.includes('@')) return jsonError(res, 400, 'Invalid email');
        const passwordHash = bcrypt.hashSync(password, 12);
        let user;
        try {
          user = await store.users.add({ email, passwordHash });
        } catch (e) {
          if (e.code === 'DUPLICATE_EMAIL') return jsonError(res, 409, 'Email already registered');
          throw e;
        }
        signSession(res, { sub: String(user.id), email: user.email });
        if (audit) audit.append({ userId: user.id, action: 'auth.signup', req }).catch(e => console.error('audit failed', e));
        res.status(201).json({ user: { id: user.id, email: user.email }, isNew: true });
      } catch (e) {
        console.error('[meridian] signup', e);
        jsonError(res, 500, 'Could not create account');
      }
    }
  );

  app.post(
    '/api/auth/login',
    authLimiter,
    validate(z.object({
      body: z.object({
        email: z.string().min(3).max(254).transform(normalizeEmail),
        password: z.string().min(1).max(256),
      }).strict(),
    })),
    async (req, res) => {
      try {
        const { email, password } = req.validated.body;
        const row = await store.users.findByEmail(email);
        if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
          return jsonError(res, 401, 'Invalid email or password');
        }
        signSession(res, { sub: String(row.id), email: row.email });
        if (audit) audit.append({ userId: row.id, action: 'auth.login', req }).catch(e => console.error('audit failed', e));
        res.json({ user: { id: row.id, email: row.email }, isNew: false });
      } catch (e) {
        console.error('[meridian] login', e);
        jsonError(res, 500, 'Could not sign in');
      }
    }
  );

  app.post('/api/auth/logout', (req, res) => {
    clearSession(res);
    if (audit) audit.append({ userId: req.user?.id || null, action: 'auth.logout', req }).catch(e => console.error('audit failed', e));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = readUser(req);
    if (!user) return res.status(401).json({ user: null });
    const row = await store.users.findById(user.id);
    if (!row) {
      clearSession(res);
      return res.status(401).json({ user: null });
    }
    res.json({ user: { id: row.id, email: row.email } });
  });
}

module.exports = { register };

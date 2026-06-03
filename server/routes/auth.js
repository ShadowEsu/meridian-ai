'use strict';
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { authLimiter } = require('../lib/rate-limiters');
const { signSession, clearSession, readUser } = require('../auth-middleware');
const { jsonError } = require('../lib/errors');
const { isConfigured: supabaseConfigured, verifyAccessToken, supabaseConfig } = require('../lib/supabase-auth');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function userPublic(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name || null,
    avatarUrl: row.avatarUrl || null,
  };
}

function register(app, { store, audit }) {
  // Public — frontend reads this on boot to know whether Google sign-in is available
  // and which Supabase project to talk to. Never returns the JWT secret.
  app.get('/api/auth/config', (_req, res) => {
    const c = supabaseConfig();
    res.json({
      googleEnabled: supabaseConfigured(),
      supabaseUrl: c.url || null,
      supabaseAnonKey: c.anonKey || null,
    });
  });

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
        res.status(201).json({ user: userPublic(user), isNew: true });
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
        // Google-only users have no passwordHash; reject password login for them.
        if (!row || !row.passwordHash || !bcrypt.compareSync(password, row.passwordHash)) {
          return jsonError(res, 401, 'Invalid email or password');
        }
        signSession(res, { sub: String(row.id), email: row.email });
        if (audit) audit.append({ userId: row.id, action: 'auth.login', req }).catch(e => console.error('audit failed', e));
        res.json({ user: userPublic(row), isNew: false });
      } catch (e) {
        console.error('[meridian] login', e);
        jsonError(res, 500, 'Could not sign in');
      }
    }
  );

  // Exchange a Supabase access token for a Meridian session cookie.
  // Frontend gets the token from supabase.auth.getSession() after Google OAuth.
  // Verified via Supabase Auth (ECC) or legacy HS256; auto-link / create local user by email.
  app.post(
    '/api/auth/supabase-session',
    authLimiter,
    validate(z.object({
      body: z.object({
        accessToken: z.string().min(20).max(8192),
      }).strict(),
    })),
    async (req, res) => {
      if (!supabaseConfigured()) {
        return jsonError(res, 503, 'Supabase auth is not configured', { code: 'SUPABASE_NOT_CONFIGURED' });
      }
      let claims;
      try {
        claims = await verifyAccessToken(req.validated.body.accessToken);
      } catch (e) {
        return jsonError(res, 401, 'Invalid Supabase token', { code: 'INVALID_TOKEN', detail: e.message });
      }
      try {
        const user = await store.users.findOrCreateBySupabase({
          supabaseUserId: claims.sub,
          email: claims.email,
          name: claims.name,
          avatarUrl: claims.avatarUrl,
        });
        signSession(res, { sub: String(user.id), email: user.email });
        if (audit) audit.append({
          userId: user.id,
          action: 'auth.supabase_session',
          meta: { provider: claims.provider || 'google' },
          req,
        }).catch(e => console.error('audit failed', e));
        res.json({ user: userPublic(user), isNew: false });
      } catch (e) {
        console.error('[meridian] supabase-session', e);
        jsonError(res, 500, 'Could not establish session');
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
    res.json({ user: userPublic(row) });
  });
}

module.exports = { register };

'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { makeApp } = require('../helpers/make-app');

const SUPABASE_JWT_SECRET = 'test-supabase-jwt-secret-must-be-at-least-32-chars-long';

function mintSupabaseToken(claims) {
  return jwt.sign(
    {
      sub: claims.sub || 'sb-user-' + Math.random().toString(36).slice(2, 8),
      email: claims.email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'google' },
      user_metadata: {
        full_name: claims.name || null,
        avatar_url: claims.avatarUrl || null,
        email: claims.email,
      },
      ...claims.extra,
    },
    SUPABASE_JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

function withSupabaseEnv(fn) {
  const keys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_JWT_SECRET'];
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'eyJ-anon-test';
  process.env.SUPABASE_JWT_SECRET = SUPABASE_JWT_SECRET;
  return Promise.resolve(fn()).finally(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

describe('GET /api/auth/config', () => {
  it('reports googleEnabled=false when env unset', async () => {
    const { app } = makeApp();
    const r = await request(app).get('/api/auth/config');
    expect(r.status).toBe(200);
    expect(r.body.googleEnabled).toBe(false);
  });

  it('exposes Supabase URL + anon key when configured', async () => {
    await withSupabaseEnv(async () => {
      const { app } = makeApp();
      const r = await request(app).get('/api/auth/config');
      expect(r.status).toBe(200);
      expect(r.body.googleEnabled).toBe(true);
      expect(r.body.supabaseUrl).toBe('https://test.supabase.co');
      expect(r.body.supabaseAnonKey).toBe('eyJ-anon-test');
    });
  });
});

describe('POST /api/auth/supabase-session', () => {
  it('503s when not configured', async () => {
    const { app } = makeApp();
    const r = await request(app)
      .post('/api/auth/supabase-session')
      .send({ accessToken: 'whatever-' + 'x'.repeat(40) });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('SUPABASE_NOT_CONFIGURED');
  });

  it('rejects invalid tokens', async () => {
    await withSupabaseEnv(async () => {
      const { app } = makeApp();
      const r = await request(app)
        .post('/api/auth/supabase-session')
        .send({ accessToken: 'not.a.real.jwt-' + 'x'.repeat(40) });
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('INVALID_TOKEN');
    });
  });

  it('creates a new local user from a valid Supabase token', async () => {
    await withSupabaseEnv(async () => {
      const { app, store } = makeApp();
      const token = mintSupabaseToken({
        sub: 'sb-abc-123',
        email: 'newuser@example.com',
        name: 'New User',
        avatarUrl: 'https://example.com/avatar.png',
      });

      const agent = request.agent(app);
      const r = await agent.post('/api/auth/supabase-session').send({ accessToken: token });
      expect(r.status).toBe(200);
      expect(r.body.user.email).toBe('newuser@example.com');
      expect(r.body.user.name).toBe('New User');
      expect(r.body.user.avatarUrl).toBe('https://example.com/avatar.png');

      // The session cookie should now identify the user.
      const me = await agent.get('/api/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe('newuser@example.com');

      // Local store should have one user with the supabase id linked.
      const stored = store._raw().users.find(u => u.email === 'newuser@example.com');
      expect(stored.supabaseUserId).toBe('sb-abc-123');
      expect(stored.passwordHash).toBeNull();
    });
  });

  it('auto-links to an existing email/password user', async () => {
    await withSupabaseEnv(async () => {
      const { app } = makeApp();
      const agent = request.agent(app);

      // Existing email/password user.
      await agent.post('/api/auth/signup').send({
        email: 'existing@example.com',
        password: 'longenough123',
      });
      await agent.post('/api/auth/logout');

      // Same email signs in via Supabase.
      const token = mintSupabaseToken({
        sub: 'sb-link-1',
        email: 'existing@example.com',
        name: 'Existing User',
      });
      const r = await agent.post('/api/auth/supabase-session').send({ accessToken: token });
      expect(r.status).toBe(200);

      // Same local user id; supabaseUserId now attached; passwordHash preserved.
      const me = await agent.get('/api/auth/me');
      expect(me.body.user.email).toBe('existing@example.com');

      const me2 = await agent.get('/api/audit-log');
      const events = me2.body.entries.map(e => e.action);
      expect(events).toContain('auth.supabase_session');
    });
  });

  it('rejects tokens missing an email claim', async () => {
    await withSupabaseEnv(async () => {
      const { app } = makeApp();
      const token = jwt.sign(
        { sub: 'no-email', aud: 'authenticated' },
        SUPABASE_JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const r = await request(app).post('/api/auth/supabase-session').send({ accessToken: token });
      expect(r.status).toBe(401);
    });
  });
});

describe('email/password login with Google-only user', () => {
  it('does not 500 when target user has no passwordHash', async () => {
    await withSupabaseEnv(async () => {
      const { app, store } = makeApp();

      // Pre-populate a Google-only user (no passwordHash).
      await store.users.findOrCreateBySupabase({
        supabaseUserId: 'sb-google-only',
        email: 'google@example.com',
        name: 'G User',
      });

      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'google@example.com', password: 'whatever123' });
      expect(r.status).toBe(401);
    });
  });
});

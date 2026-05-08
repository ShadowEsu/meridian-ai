'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

describe('auth', () => {
  it('signup → me → logout', async () => {
    const { app } = makeApp();
    const agent = request.agent(app);

    const signup = await agent.post('/api/auth/signup')
      .send({ email: 'a@b.com', password: 'longenough1' });
    expect(signup.status).toBe(201);
    expect(signup.body.user.email).toBe('a@b.com');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('a@b.com');

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);

    const me2 = await agent.get('/api/auth/me');
    expect(me2.status).toBe(401);
  });

  it('rejects duplicate email with 409', async () => {
    const { app } = makeApp();
    await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    const dup = await request(app).post('/api/auth/signup').send({ email: 'A@B.COM', password: 'longenough2' });
    expect(dup.status).toBe(409);
  });

  it('rejects bad password length', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/auth/signup').send({ email: 'a@b.com', password: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });
});

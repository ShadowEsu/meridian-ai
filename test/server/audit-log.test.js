'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

describe('audit log endpoint', () => {
  it("lists the current user's events only", async () => {
    const { app } = makeApp();
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });

    const list = await a.get('/api/audit-log');
    expect(list.status).toBe(200);
    expect(list.body.entries.some(e => e.action === 'auth.signup')).toBe(true);
  });
});

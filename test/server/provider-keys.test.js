'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

async function signup(app) {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  return agent;
}

describe('provider-keys', () => {
  it('add → list → delete', async () => {
    const { app } = makeApp();
    const agent = await signup(app);

    const add = await agent.post('/api/provider-keys')
      .send({ provider: 'anthropic', apiKey: 'sk-ant-test-1234567890', label: 'main' });
    expect(add.status).toBe(201);
    expect(add.body.key.mask).toMatch(/sk-a···7890/);
    const id = add.body.key.id;

    const list = await agent.get('/api/provider-keys');
    expect(list.body.keys).toHaveLength(1);

    const del = await agent.delete(`/api/provider-keys/${id}`);
    expect(del.status).toBe(200);

    const list2 = await agent.get('/api/provider-keys');
    expect(list2.body.keys).toHaveLength(0);
  });

  it('rejects unauthenticated request', async () => {
    const { app } = makeApp();
    const r = await request(app).get('/api/provider-keys');
    expect(r.status).toBe(401);
  });
});

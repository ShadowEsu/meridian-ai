'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

async function setup(app) {
  const a = request.agent(app);
  await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  const provider = await a.post('/api/provider-keys')
    .send({ provider: 'openai', apiKey: 'sk-1234567890', label: 'main' });
  const team = await a.post('/api/teams').send({ name: 'Eng', monthlyBudgetUsd: 1000 });
  return { agent: a, providerKeyId: provider.body.key.id, teamId: team.body.team.id };
}

describe('virtual-keys', () => {
  it('issues a one-time secret and stores only the hash', async () => {
    const { app, store } = makeApp();
    const { agent, providerKeyId, teamId } = await setup(app);

    const r = await agent.post('/api/virtual-keys')
      .send({ providerKeyId, teamId, label: 'frontend', monthlyBudgetUsd: 100 });
    expect(r.status).toBe(201);
    expect(r.body.secret).toMatch(/^mk_[A-Za-z0-9]{22}$/);
    expect(r.body.key.prefix).toMatch(/^mk_[A-Za-z0-9]{6}$/);

    // Verify store has hash, not plaintext
    const raw = store._raw().virtualKeys[0];
    expect(raw.keyHash).toBeTruthy();
    expect(raw.keyHash).not.toBe(r.body.secret);
  });

  it('list does not return the secret', async () => {
    const { app } = makeApp();
    const { agent, providerKeyId, teamId } = await setup(app);
    await agent.post('/api/virtual-keys').send({ providerKeyId, teamId, label: 'x' });
    const list = await agent.get('/api/virtual-keys');
    for (const k of list.body.keys) expect(k.secret).toBeUndefined();
    expect(list.body.keys[0].prefix).toMatch(/^mk_/);
  });
});

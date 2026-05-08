'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

describe('agents', () => {
  it('create → start run → ingest request → list runs', async () => {
    const { app } = makeApp();
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    const pk = await a.post('/api/provider-keys').send({ provider: 'openai', apiKey: 'sk-1234567890' });
    const vk = await a.post('/api/virtual-keys').send({ providerKeyId: pk.body.key.id, label: 'k' });
    const ag = await a.post('/api/agents').send({ name: 'reviewer' });

    const run = await a.post(`/api/agents/${ag.body.agent.id}/runs`).send({});
    expect(run.status).toBe(201);

    await request(app).post('/api/v1/requests')
      .set('X-Meridian-Key', vk.body.secret)
      .send({ provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 500, completionTokens: 500, agentId: ag.body.agent.id });

    const runs = await a.get(`/api/agents/${ag.body.agent.id}/runs`);
    expect(runs.body.runs[0].requestCount).toBe(1);
    expect(runs.body.runs[0].costUsd).toBeGreaterThan(0);
  });
});

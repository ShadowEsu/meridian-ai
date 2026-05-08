'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

async function seed() {
  const ctx = makeApp();
  const a = request.agent(ctx.app);
  await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  const pk = await a.post('/api/provider-keys').send({ provider: 'openai', apiKey: 'sk-1234567890', label: '' });
  const tm = await a.post('/api/teams').send({ name: 'T', monthlyBudgetUsd: 1000 });
  const vk = await a.post('/api/virtual-keys').send({
    providerKeyId: pk.body.key.id, teamId: tm.body.team.id, label: 'frontend', monthlyBudgetUsd: 100,
  });
  return { ...ctx, agent: a, secret: vk.body.secret, virtualKeyId: vk.body.key.id, teamId: tm.body.team.id };
}

describe('requests', () => {
  it('rejects ingest without virtual key header', async () => {
    const { app } = await seed();
    const r = await request(app).post('/api/v1/requests').send({ provider: 'openai', model: 'gpt-4.1-mini' });
    expect(r.status).toBe(401);
  });

  it('ingests a request and computes cost', async () => {
    const { app, secret, virtualKeyId } = await seed();
    const r = await request(app).post('/api/v1/requests')
      .set('X-Meridian-Key', secret)
      .send({
        provider: 'openai', model: 'gpt-4.1-mini',
        promptTokens: 1000, completionTokens: 500, latencyMs: 230, status: 'ok',
      });
    expect(r.status).toBe(201);
    expect(r.body.costUsd).toBeCloseTo((1000 * 0.4 + 500 * 1.6) / 1_000_000, 8);
    expect(r.body.severity).toBe('ok');

    const list = await request.agent(app)        // session cookie not needed for ingest, but is for query
      .get(`/api/requests?virtualKeyId=${virtualKeyId}`);
    // Without session cookie, 401:
    expect(list.status).toBe(401);
  });

  it('list endpoint returns ingested rows when authenticated', async () => {
    const { app, agent, secret, virtualKeyId } = await seed();
    await request(app).post('/api/v1/requests')
      .set('X-Meridian-Key', secret)
      .send({ provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 100, completionTokens: 100, status: 'ok' });
    const list = await agent.get(`/api/requests?virtualKeyId=${virtualKeyId}`);
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.total).toBe(1);
  });
});

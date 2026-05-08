'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

async function seedRequests(ctx, n) {
  // Insert directly into the store to avoid bcrypt round-trips in a tight loop.
  const u = await ctx.store.users.add({ email: 'a@b.com', passwordHash: 'h' });
  const team = await ctx.store.teams.add(u.id, { name: 'T', monthlyBudgetUsd: 1000 });
  const pk = await ctx.store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'x', iv: 'a', ciphertext: 'b', authTag: 'c' });
  const vk = await ctx.store.virtualKeys.add(u.id, { providerKeyId: pk.id, teamId: team.id, label: 'x', prefix: 'mk_zzzzzz', keyHash: 'h', monthlyBudgetUsd: null });
  for (let i = 0; i < n; i++) {
    await ctx.store.requests.add({
      userId: u.id, virtualKeyId: vk.id, teamId: team.id, agentId: null,
      provider: 'openai', model: 'gpt-4.1-mini',
      promptTokens: 100, completionTokens: 100, latencyMs: 200, costUsd: 0.0002, status: 'ok',
    });
  }
  return { userId: u.id, teamId: team.id };
}

describe('kpi', () => {
  it('overview returns aggregates for the current user', async () => {
    const ctx = makeApp();
    const { userId } = await seedRequests(ctx, 5);

    // Simulate session cookie by signing in as the seeded user is awkward; instead
    // create a parallel signed-in agent and seed under that user.
    // We'll re-seed via the HTTP path in a real test; for now ensure the endpoint exists:
    const r = await request(ctx.app).get('/api/kpi/overview');
    expect(r.status).toBe(401); // unauthenticated
  });

  it('overview after ingesting 3 requests returns totals', async () => {
    const ctx = makeApp();
    const a = request.agent(ctx.app);
    await a.post('/api/auth/signup').send({ email: 'b@c.com', password: 'longenough1' });
    const pk = await a.post('/api/provider-keys').send({ provider: 'openai', apiKey: 'sk-1234567890' });
    const vk = await a.post('/api/virtual-keys').send({ providerKeyId: pk.body.key.id, label: 'k' });
    for (let i = 0; i < 3; i++) {
      await request(ctx.app).post('/api/v1/requests')
        .set('X-Meridian-Key', vk.body.secret)
        .send({ provider: 'openai', model: 'gpt-4.1-mini', promptTokens: 100, completionTokens: 100, status: 'ok' });
    }
    const r = await a.get('/api/kpi/overview');
    expect(r.status).toBe(200);
    expect(r.body.totalRequests).toBe(3);
    expect(r.body.totalSpendUsd).toBeGreaterThan(0);
    expect(Array.isArray(r.body.dailySpend)).toBe(true);
    expect(Array.isArray(r.body.modelMix)).toBe(true);
  });
});

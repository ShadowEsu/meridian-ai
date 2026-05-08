'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

describe('alerts', () => {
  it('CRUD round-trip', async () => {
    const { app } = makeApp();
    const a = request.agent(app);
    await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
    const create = await a.post('/api/alerts').send({ name: 'monthly', type: 'team_budget', target: { teamId: 1 }, thresholdUsd: 1000 });
    expect(create.status).toBe(201);
    const id = create.body.alert.id;

    const list = await a.get('/api/alerts');
    expect(list.body.alerts).toHaveLength(1);

    const upd = await a.put(`/api/alerts/${id}`).send({ state: 'paused' });
    expect(upd.body.alert.state).toBe('paused');

    const del = await a.delete(`/api/alerts/${id}`);
    expect(del.status).toBe(200);
  });
});

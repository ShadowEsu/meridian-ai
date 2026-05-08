'use strict';
const request = require('supertest');
const { makeApp } = require('../helpers/make-app');

async function signin(app) {
  const a = request.agent(app);
  await a.post('/api/auth/signup').send({ email: 'a@b.com', password: 'longenough1' });
  return a;
}

describe('teams', () => {
  it('CRUD round-trip', async () => {
    const { app } = makeApp();
    const a = await signin(app);

    const create = await a.post('/api/teams').send({ name: 'Engineering', monthlyBudgetUsd: 1500 });
    expect(create.status).toBe(201);
    const id = create.body.team.id;

    const list = await a.get('/api/teams');
    expect(list.body.teams).toHaveLength(1);

    const update = await a.put(`/api/teams/${id}`).send({ monthlyBudgetUsd: 2000 });
    expect(update.body.team.monthlyBudgetUsd).toBe(2000);

    const del = await a.delete(`/api/teams/${id}`);
    expect(del.status).toBe(200);

    const list2 = await a.get('/api/teams');
    expect(list2.body.teams).toHaveLength(0);
  });

  it('rejects negative budget', async () => {
    const { app } = makeApp();
    const a = await signin(app);
    const r = await a.post('/api/teams').send({ name: 'X', monthlyBudgetUsd: -1 });
    expect(r.status).toBe(400);
  });
});

'use strict';
const { makeApp } = require('../helpers/make-app');
const { createBudgetEngine } = require('../../server/services/budget-engine');

async function seed() {
  const { store } = makeApp();
  const u = await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
  const team = await store.teams.add(u.id, { name: 'T', monthlyBudgetUsd: 100 });
  // Provider key dummy fields are fine here; nothing decrypts in this test.
  const pk = await store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'sk-x', iv: 'a', ciphertext: 'b', authTag: 'c' });
  const vk = await store.virtualKeys.add(u.id, {
    providerKeyId: pk.id, teamId: team.id, label: 'x',
    prefix: 'mk_aaaaaa', keyHash: 'hash', monthlyBudgetUsd: 50,
  });
  return { store, u, team, vk };
}

describe('budget engine', () => {
  it('classifies spend levels', async () => {
    const { store, u, vk } = await seed();
    const eng = createBudgetEngine({ store });

    const a = await eng.classify({ userId: u.id, virtualKeyId: vk.id, addUsd: 10 });
    expect(a.severity).toBe('ok');

    await store.virtualKeys.recordSpend(vk.id, 40);             // 40/50 spent
    const b = await eng.classify({ userId: u.id, virtualKeyId: vk.id, addUsd: 5 });    // 45/50 -> warn band starts at 80%
    expect(b.severity).toBe('warn');

    await store.virtualKeys.recordSpend(vk.id, 10);             // 50/50
    const c = await eng.classify({ userId: u.id, virtualKeyId: vk.id, addUsd: 1 });    // 51/50 -> over
    expect(c.severity).toBe('over');
  });

  it('aggregates team spend across keys', async () => {
    const { store, u, team } = await seed();
    const eng = createBudgetEngine({ store });
    // Two virtual keys on same team, no per-key budget
    const pk2 = await store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'x', iv: 'a', ciphertext: 'b', authTag: 'c' });
    const k2 = await store.virtualKeys.add(u.id, { providerKeyId: pk2.id, teamId: team.id, label: 'y', prefix: 'mk_bbbbbb', keyHash: 'h', monthlyBudgetUsd: null });
    await store.virtualKeys.recordSpend(k2.id, 99);
    const r = await eng.classify({ userId: u.id, virtualKeyId: k2.id, addUsd: 2 });    // team has 99 + 2 = 101 / 100 -> over
    expect(r.severity).toBe('over');
    expect(r.scope).toBe('team');
  });
});

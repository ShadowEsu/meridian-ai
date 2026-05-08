'use strict';
const { makeApp } = require('../helpers/make-app');
const { createAlertEngine } = require('../../server/services/alert-engine');

async function setup() {
  const { store } = makeApp();
  const u = await store.users.add({ email: 'a@b.com', passwordHash: 'h' });
  const team = await store.teams.add(u.id, { name: 'T', monthlyBudgetUsd: 1000 });
  const pk = await store.providerKeys.add(u.id, { provider: 'openai', label: '', mask: 'x', iv: 'a', ciphertext: 'b', authTag: 'c' });
  const vk = await store.virtualKeys.add(u.id, { providerKeyId: pk.id, teamId: team.id, label: 'x', prefix: 'mk_aaaaaa', keyHash: 'h', monthlyBudgetUsd: 50 });
  return { store, u, team, vk };
}

describe('alert engine', () => {
  it('triggers a key_budget alert when spend exceeds threshold', async () => {
    const { store, u, vk } = await setup();
    const alert = await store.alerts.add(u.id, { name: 'big', type: 'key_budget', target: { virtualKeyId: vk.id }, thresholdUsd: 25 });

    await store.virtualKeys.recordSpend(vk.id, 30);
    const eng = createAlertEngine({ store });
    await eng.onRequest({
      request: { userId: u.id, virtualKeyId: vk.id, teamId: vk.teamId, costUsd: 0.01, timestamp: new Date().toISOString() },
      severity: { severity: 'over', scope: 'key' },
    });
    const after = (await store.alerts.list(u.id))[0];
    expect(after.state).toBe('triggered');
  });

  it('does not trigger a paused alert', async () => {
    const { store, u, vk } = await setup();
    await store.alerts.add(u.id, { name: 'p', type: 'key_budget', target: { virtualKeyId: vk.id }, thresholdUsd: 1 });
    const list1 = await store.alerts.list(u.id);
    await store.alerts.update(u.id, list1[0].id, { state: 'paused' });
    await store.virtualKeys.recordSpend(vk.id, 100);
    const eng = createAlertEngine({ store });
    await eng.onRequest({
      request: { userId: u.id, virtualKeyId: vk.id, teamId: vk.teamId, costUsd: 1, timestamp: new Date().toISOString() },
      severity: { severity: 'over', scope: 'key' },
    });
    const after = (await store.alerts.list(u.id))[0];
    expect(after.state).toBe('paused');
  });
});

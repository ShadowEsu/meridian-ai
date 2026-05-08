#!/usr/bin/env node
'use strict';

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

const { createStore } = require('../server/store');
const { encryptSecret } = require('../server/crypto-secret');
const { costFor, listModels } = require('../server/services/pricing');

(async function main() {
  const storePath = process.env.MERIDIAN_STORE_PATH || path.join(__dirname, '..', 'data', 'meridian-store.json');
  const store = createStore({ kind: 'json', path: storePath });

  let user = await store.users.findByEmail('demo@meridian.local');
  if (!user) user = await store.users.add({ email: 'demo@meridian.local', passwordHash: bcrypt.hashSync('demo123demo', 10) });

  const providers = ['anthropic', 'openai', 'google', 'mistral'];
  const providerKeys = {};
  for (const p of providers) {
    const enc = encryptSecret(`sk-${p}-demo-${crypto.randomBytes(8).toString('hex')}`);
    const row = await store.providerKeys.add(user.id, { provider: p, label: 'demo', mask: 'sk-d···demo', ...enc });
    providerKeys[p] = row.id;
  }

  const teams = [];
  for (const name of ['Engineering', 'Research', 'Marketing']) {
    teams.push(await store.teams.add(user.id, { name, monthlyBudgetUsd: 1500 }));
  }

  const vKeys = [];
  for (let i = 0; i < 6; i++) {
    const provider = providers[i % providers.length];
    const team = teams[i % teams.length];
    const secret = `mk_${crypto.randomBytes(16).toString('base64url').slice(0, 22)}`;
    vKeys.push(await store.virtualKeys.add(user.id, {
      providerKeyId: providerKeys[provider], teamId: team.id,
      label: `${team.name} key ${i + 1}`,
      prefix: secret.slice(0, 9), keyHash: bcrypt.hashSync(secret, 6),
      monthlyBudgetUsd: 250 + (i * 100),
    }));
  }

  for (const name of ['paper-summarizer', 'code-reviewer', 'support-triager']) {
    await store.agents.add(user.id, { name, description: `${name} demo agent`, teamId: teams[0].id, maxRunCostUsd: 5, maxLoopIterations: 50 });
  }

  await store.alerts.add(user.id, { name: 'Eng monthly', type: 'team_budget', target: { teamId: teams[0].id }, thresholdUsd: 1200 });
  await store.alerts.add(user.id, { name: 'Spike', type: 'spike', thresholdRpm: 60, windowMinutes: 5 });
  await store.alerts.add(user.id, { name: 'Frontend cap', type: 'key_budget', target: { virtualKeyId: vKeys[0].id }, thresholdUsd: 200 });

  const models = listModels();
  const now = Date.now();
  for (let i = 0; i < 500; i++) {
    const m = models[Math.floor(Math.random() * models.length)];
    const vk = vKeys[Math.floor(Math.random() * vKeys.length)];
    const promptTokens = 200 + Math.floor(Math.random() * 4000);
    const completionTokens = 100 + Math.floor(Math.random() * 1500);
    const ts = new Date(now - Math.floor(Math.random() * 30 * 24 * 3600 * 1000)).toISOString();
    const cost = costFor({ provider: m.provider, model: m.model, promptTokens, completionTokens });
    await store.requests.add({
      userId: user.id, virtualKeyId: vk.id, teamId: vk.teamId, agentId: null,
      provider: m.provider, model: m.model, promptTokens, completionTokens,
      latencyMs: 120 + Math.floor(Math.random() * 800),
      costUsd: cost, status: Math.random() < 0.95 ? 'ok' : 'error',
      timestamp: ts,
    });
  }

  console.log(`Seeded demo data into ${storePath}`);
  console.log('Login with demo@meridian.local / demo123demo');
})();

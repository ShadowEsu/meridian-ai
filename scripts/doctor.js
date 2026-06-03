#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const checks = [];

function ok(name, detail) { checks.push({ ok: true, name, detail: detail || '' }); }
function fail(name, detail) { checks.push({ ok: false, name, detail: detail || '' }); }

(async function main() {
  // Env
  if ((process.env.JWT_SECRET || '').length >= 32) ok('JWT_SECRET', 'present (>=32 chars)');
  else fail('JWT_SECRET', 'missing or too short — see .env.example');

  if (/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY || '')) ok('ENCRYPTION_KEY', '64 hex chars');
  else fail('ENCRYPTION_KEY', 'not 64 hex chars — generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');

  ok('PORT', String(process.env.PORT || 5500));
  ok('NODE_ENV', String(process.env.NODE_ENV || 'development'));

  const storeKind = (process.env.MERIDIAN_STORE || 'json').toLowerCase();
  ok('MERIDIAN_STORE', storeKind);

  if (storeKind === 'supabase') {
    const url = process.env.SUPABASE_URL || '';
    const anon = process.env.SUPABASE_ANON_KEY || '';
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (url.startsWith('https://') && url.includes('.supabase.co')) ok('SUPABASE_URL', url);
    else fail('SUPABASE_URL', 'missing or invalid');
    if (anon.length > 20) ok('SUPABASE_ANON_KEY', 'present');
    else fail('SUPABASE_ANON_KEY', 'missing — publishable key from Supabase dashboard');
    if (svc.length > 20) ok('SUPABASE_SERVICE_ROLE_KEY', 'present');
    else fail('SUPABASE_SERVICE_ROLE_KEY', 'missing — secret key (server only)');
  }

  // Store
  try {
    const { createStore } = require('../server/store');
    const storePath = process.env.MERIDIAN_STORE_PATH || path.join(__dirname, '..', 'data', 'meridian-store.json');
    const store = storeKind === 'supabase'
      ? createStore({ kind: 'supabase' })
      : createStore({ kind: 'json', path: storePath });
    const users = await store.users.all();
    const label = storeKind === 'supabase' ? 'supabase' : storePath;
    ok('store', `${label} (${users.length} users)`);
  } catch (e) {
    fail('store', e.message);
  }

  // Pricing table
  try {
    const { listModels } = require('../server/services/pricing');
    ok('pricing', `${listModels().length} models priced`);
  } catch (e) {
    fail('pricing', e.message);
  }

  let failed = 0;
  for (const c of checks) {
    const tag = c.ok ? '✓' : '✗';
    console.log(`${tag} ${c.name.padEnd(18)} ${c.detail}`);
    if (!c.ok) failed++;
  }
  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nall good.');
})();

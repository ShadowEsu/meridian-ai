'use strict';
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Set JWT_SECRET and ENCRYPTION_KEY in .env (see .env.example)');
    process.exit(1);
  }
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  console.warn('[meridian] Dev mode: ephemeral JWT_SECRET + ENCRYPTION_KEY (set them in .env to persist).');
}

const express = require('express');
const { createStore } = require('./store');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5500;
const ROOT = path.join(__dirname, '..');
const LANDING = path.join(ROOT, 'landing');
const STORE_KIND = (process.env.MERIDIAN_STORE || 'json').toLowerCase();
const STORE_PATH = process.env.MERIDIAN_STORE_PATH || path.join(ROOT, 'data', 'meridian-store.json');
const IS_PROD = process.env.NODE_ENV === 'production';

// Production: require persistent storage. JSON in prod is a footgun
// (single-process only, no atomic writes across replicas).
if (IS_PROD && STORE_KIND === 'json') {
  console.error('[meridian] NODE_ENV=production requires MERIDIAN_STORE=supabase. See docs/DEPLOY.md.');
  process.exit(1);
}

// Validate Supabase env when needed.
if (STORE_KIND === 'supabase') {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[meridian] MERIDIAN_STORE=supabase requires: ${missing.join(', ')}. See docs/SUPABASE_SETUP.md.`);
    process.exit(1);
  }
}

const store = STORE_KIND === 'supabase'
  ? createStore({ kind: 'supabase' })
  : createStore({ kind: 'json', path: STORE_PATH });

const app = createApp({ store });

// Serve .jsx as JavaScript so browsers/Babel fetch accepts them
express.static.mime.define({ 'application/javascript': ['jsx'] });
// Marketing site (optional): /home
app.use('/home', express.static(LANDING, { extensions: ['html'] }));
app.get('/home', (_req, res) => res.sendFile(path.join(LANDING, 'index.html')));
// Dashboard + APIs at site root (same as meridian20.onrender.com production)
app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'Meridian.html')));
app.get('/app', (_req, res) => res.redirect(301, '/'));

app.listen(PORT, () => {
  console.log(`Meridian server http://localhost:${PORT}`);
  console.log(`  Dashboard  http://localhost:${PORT}/`);
  console.log(`  Landing    http://localhost:${PORT}/home`);
  console.log(`Store: ${STORE_KIND}${STORE_KIND === 'json' ? ` (${STORE_PATH})` : ''}`);
});

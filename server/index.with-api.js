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
const STORE_PATH = process.env.MERIDIAN_STORE_PATH || path.join(ROOT, 'data', 'meridian-store.json');

const store = createStore({ kind: 'json', path: STORE_PATH });
const app = createApp({ store });

app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'Meridian.html')));

app.listen(PORT, () => {
  console.log(`Meridian server http://localhost:${PORT}`);
  console.log(`JSON store: ${STORE_PATH}`);
});

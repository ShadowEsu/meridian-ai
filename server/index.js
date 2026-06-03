'use strict';

/**
 * Static file server for the Meridian UI demo (sample numbers in data.jsx).
 * Auth, JSON store, and provider APIs are disabled for now — see server/index.with-api.js
 * and run: npm run start:api
 */
const path = require('path');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const LANDING = path.join(ROOT, 'landing');

const app = express();
const { mountStaticRoutes } = require('./lib/static-routes');
mountStaticRoutes(app, { root: ROOT, landing: LANDING });

app.listen(PORT, () => {
  console.log(`Meridian UI (static demo)  http://localhost:${PORT}`);
  console.log(`  Landing    http://localhost:${PORT}/`);
  console.log(`  Dashboard  http://localhost:${PORT}/app`);
});

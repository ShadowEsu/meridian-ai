'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const { readUser } = require('./auth-middleware');
const { apiLimiter } = require('./lib/rate-limiters');
const { jsonError } = require('./lib/errors');

const authRoutes         = require('./routes/auth');
const providerKeysRoutes = require('./routes/provider-keys');
const proxyRoutes        = require('./routes/proxy');

function createApp({ store }) {
  if (!store) throw new Error('createApp requires { store }');

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.NODE_ENV === 'production');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '256kb', strict: true, type: ['application/json', 'application/*+json'] }));
  app.use(cookieParser());

  app.use((req, _res, next) => { req.user = readUser(req); next(); });

  app.use('/api', apiLimiter);

  const ctx = { store };
  authRoutes.register(app, ctx);
  providerKeysRoutes.register(app, ctx);
  proxyRoutes.register(app, ctx);
  // Later tasks register more routes here:
  //   teams, virtualKeys, agents, alerts, requests, kpi, auditLog

  // 404 fallthrough for /api/* must be JSON, not the static file 404 page.
  app.use('/api', (_req, res) => jsonError(res, 404, 'Not found', { code: 'NOT_FOUND' }));

  // Static UI is mounted by the entrypoint, not here, so tests don't depend on /Meridian.html.

  return app;
}

module.exports = { createApp };

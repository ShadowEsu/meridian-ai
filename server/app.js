'use strict';
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const { readUser } = require('./auth-middleware');
const { apiLimiter } = require('./lib/rate-limiters');
const { jsonError } = require('./lib/errors');

const authRoutes         = require('./routes/auth');
const providerKeysRoutes = require('./routes/provider-keys');
const auditLogRoutes     = require('./routes/audit-log');
const teamsRoutes        = require('./routes/teams');
const virtualKeysRoutes  = require('./routes/virtual-keys');
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

  const { createAuditLog } = require('./services/audit-log');
  const ctx = { store };
  ctx.audit = createAuditLog({ store });
  authRoutes.register(app, ctx);
  providerKeysRoutes.register(app, ctx);
  auditLogRoutes.register(app, ctx);
  teamsRoutes.register(app, ctx);
  virtualKeysRoutes.register(app, ctx);
  proxyRoutes.register(app, ctx);
  // Later tasks register more routes here:
  //   agents, alerts, requests, kpi

  // 404 fallthrough for /api/* must be JSON, not the static file 404 page.
  app.use('/api', (_req, res) => jsonError(res, 404, 'Not found', { code: 'NOT_FOUND' }));

  // Static UI is mounted by the entrypoint, not here, so tests don't depend on /Meridian.html.

  return app;
}

module.exports = { createApp };

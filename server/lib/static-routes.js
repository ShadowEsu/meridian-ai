'use strict';

const path = require('path');
const express = require('express');

/** Paths that must never be served as static files (even if present on disk). */
const BLOCKED_PREFIXES = [
  '/data',
  '/server',
  '/test',
  '/schema',
  '/python',
  '/scripts',
  '/docs',
  '/design-system',
  '/.env',
];

function isBlocked(reqPath) {
  const p = reqPath.split('?')[0];
  return BLOCKED_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix + '/')
  );
}

/**
 * Mount marketing page, dashboard SPA assets, and block repo internals.
 * API routes must be registered on `app` before calling this.
 */
function mountStaticRoutes(app, { root, landing }) {
  app.use((req, res, next) => {
    if (isBlocked(req.path)) return res.status(404).end();
    next();
  });

  express.static.mime.define({ 'application/javascript': ['jsx'] });

  // Dashboard SPA
  app.get('/app', (_req, res) => res.sendFile(path.join(root, 'Meridian.html')));
  app.get('/home', (_req, res) => res.redirect(301, '/'));

  // Marketing homepage
  app.get('/', (_req, res) => res.sendFile(path.join(landing, 'index.html')));
  app.use(express.static(landing, { index: false, extensions: ['html', 'css'] }));

  // SPA assets only (not the whole repo root)
  app.use('/src', express.static(path.join(root, 'src')));
  app.use('/node_modules', express.static(path.join(root, 'node_modules')));
}

module.exports = { mountStaticRoutes, isBlocked, BLOCKED_PREFIXES };

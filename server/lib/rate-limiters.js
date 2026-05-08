'use strict';
const rateLimit = require('express-rate-limit');
const { jsonError, CODES } = require('./errors');

function makeLimiter({ windowMs, max, scope, byUser }) {
  if (process.env.NODE_ENV === 'test') {
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs, max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const uid = byUser && req.user && req.user.id ? String(req.user.id) : '';
      return uid ? `${scope}:u:${uid}` : `${scope}:ip:${ip}`;
    },
    handler: (_req, res) => {
      const ra = Number(res.getHeader('Retry-After') || 0);
      jsonError(res, 429, 'Too many requests', {
        code: CODES.RATE_LIMITED,
        scope,
        retryAfterSeconds: ra || undefined,
      });
    },
  });
}

const apiLimiter        = makeLimiter({ windowMs: 60_000,         max: 120, scope: 'api',    byUser: false });
const authLimiter       = makeLimiter({ windowMs: 15 * 60_000,    max: 20,  scope: 'auth',   byUser: false });
const userWriteLimiter  = makeLimiter({ windowMs: 60_000,         max: 60,  scope: 'write',  byUser: true  });
const proxyLimiter      = makeLimiter({ windowMs: 60_000,         max: 30,  scope: 'proxy',  byUser: true  });
const ingestLimiter     = makeLimiter({ windowMs: 60_000,         max: 600, scope: 'ingest', byUser: true  });

module.exports = { makeLimiter, apiLimiter, authLimiter, userWriteLimiter, proxyLimiter, ingestLimiter };

'use strict';

const REDACTED_KEYS = new Set(['apiKey', 'password', 'passwordHash', 'token', 'secret', 'cookie']);

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(k)) continue;
    out[k] = typeof v === 'object' ? sanitizeMeta(v) : v;
  }
  return out;
}

function ipFromReq(req) {
  if (!req) return null;
  return req.ip || req.connection?.remoteAddress || null;
}

/**
 * Creates an audit log service backed by the given store.
 * @param {{ store: object }} opts
 */
function createAuditLog({ store }) {
  return {
    /**
     * Appends an audit entry, redacting PII fields from meta.
     * @param {{ userId, action, target?, meta?, ip?, req? }} entry
     */
    append: async ({ userId, action, target, meta, ip, req }) => {
      const safeMeta = sanitizeMeta(meta);
      return store.auditLog.append({
        userId, action, target: target || null,
        meta: safeMeta, ip: ip || ipFromReq(req),
      });
    },
    /**
     * Lists audit entries for a user.
     * @param {{ userId?, limit? }} opts
     */
    list: ({ userId, limit } = {}) => store.auditLog.list({ userId, limit }),
  };
}

module.exports = { createAuditLog };

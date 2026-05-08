'use strict';
const { z } = require('zod');
const { validate } = require('../lib/validate');
const { requireUser } = require('../auth-middleware');

function register(app, { store }) {
  app.get(
    '/api/audit-log',
    requireUser,
    validate(z.object({
      query: z.object({ limit: z.string().regex(/^\d+$/).optional() }).strict(),
    })),
    async (req, res) => {
      const limit = req.validated.query.limit ? Number(req.validated.query.limit) : 100;
      const rows = await store.auditLog.list({ userId: req.user.id, limit });
      res.json({ entries: rows });
    }
  );
}

module.exports = { register };

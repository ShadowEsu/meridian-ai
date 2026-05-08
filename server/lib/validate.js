'use strict';
const { jsonError, CODES } = require('./errors');

function validate(schema) {
  return (req, res, next) => {
    const out = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!out.success) {
      return jsonError(res, 400, 'Invalid request', {
        code: CODES.VALIDATION_ERROR,
        issues: out.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.validated = out.data;
    next();
  };
}

module.exports = { validate };

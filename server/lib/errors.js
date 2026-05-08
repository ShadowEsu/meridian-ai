'use strict';

function jsonError(res, status, error, extra) {
  res.status(status).json({ error, ...(extra || {}) });
}

const CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
};

module.exports = { jsonError, CODES };

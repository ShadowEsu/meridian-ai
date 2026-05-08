'use strict';
const bcrypt = require('bcryptjs');
const { jsonError } = require('./errors');

function authByVirtualKey({ store }) {
  return async (req, res, next) => {
    const header = req.get('X-Meridian-Key');
    if (!header || !/^mk_[A-Za-z0-9]{22}$/.test(header)) {
      return jsonError(res, 401, 'Missing or malformed X-Meridian-Key', { code: 'UNAUTHORIZED' });
    }
    const prefix = header.slice(0, 9);
    const candidates = await store.virtualKeys.findByPrefix(prefix);
    let match = null;
    for (const c of candidates) {
      if (bcrypt.compareSync(header, c.keyHash)) { match = c; break; }
    }
    if (!match) return jsonError(res, 401, 'Invalid X-Meridian-Key', { code: 'UNAUTHORIZED' });
    req.user = { id: match.userId };
    req.virtualKey = match;
    next();
  };
}

module.exports = { authByVirtualKey };

'use strict';

function createStore(opts) {
  const kind = (opts && opts.kind) || process.env.MERIDIAN_STORE || 'json';
  if (kind === 'supabase') {
    const { createSupabaseStore } = require('./supabase');
    return createSupabaseStore(opts);
  }
  const { createJsonStore } = require('./json');
  return createJsonStore(opts);
}

module.exports = { createStore };

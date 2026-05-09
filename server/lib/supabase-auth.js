'use strict';

const jwt = require('jsonwebtoken');

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  };
}

function isConfigured() {
  const c = supabaseConfig();
  return !!(c.url && c.anonKey && c.jwtSecret);
}

// Verifies a Supabase access token (HS256, signed with project JWT secret).
// Returns { sub, email, name, avatarUrl } on success. Throws on failure.
function verifyAccessToken(accessToken) {
  const c = supabaseConfig();
  if (!c.jwtSecret) {
    const err = new Error('SUPABASE_JWT_SECRET not configured');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const decoded = jwt.verify(accessToken, c.jwtSecret, {
    algorithms: ['HS256'],
    audience: 'authenticated',
  });
  const meta = decoded.user_metadata || {};
  const email = String(decoded.email || meta.email || '').toLowerCase();
  if (!email) {
    const err = new Error('token has no email claim');
    err.code = 'NO_EMAIL';
    throw err;
  }
  return {
    sub: String(decoded.sub),
    email,
    name: meta.full_name || meta.name || null,
    avatarUrl: meta.avatar_url || meta.picture || null,
    provider: (decoded.app_metadata && decoded.app_metadata.provider) || null,
  };
}

module.exports = { supabaseConfig, isConfigured, verifyAccessToken };

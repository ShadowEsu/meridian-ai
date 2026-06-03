'use strict';

const jwt = require('jsonwebtoken');

function supabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  };
}

function isConfigured() {
  const c = supabaseConfig();
  // URL + anon key are enough; Supabase Auth validates ECC (P-256) tokens for us.
  return !!(c.url && c.anonKey);
}

function mapSupabaseUser(user) {
  const meta = user.user_metadata || {};
  const email = String(user.email || meta.email || '').toLowerCase();
  if (!email) {
    const err = new Error('token has no email claim');
    err.code = 'NO_EMAIL';
    throw err;
  }
  return {
    sub: String(user.id),
    email,
    name: meta.full_name || meta.name || user.name || null,
    avatarUrl: meta.avatar_url || meta.picture || null,
    provider: (user.app_metadata && user.app_metadata.provider) || null,
  };
}

function verifyAccessTokenLegacy(accessToken, jwtSecret) {
  const decoded = jwt.verify(accessToken, jwtSecret, {
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

// Verify a Supabase access token. Works with modern ECC (P-256) signing keys
// by asking Supabase Auth directly; falls back to legacy HS256 if JWT secret set.
async function verifyAccessToken(accessToken) {
  const c = supabaseConfig();
  if (!c.url || !c.anonKey) {
    const err = new Error('SUPABASE_URL and SUPABASE_ANON_KEY required');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  // Primary: Supabase validates the token (supports ECC / ES256 signing keys).
  try {
    const r = await fetch(`${c.url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: c.anonKey,
      },
    });
    if (r.ok) {
      return mapSupabaseUser(await r.json());
    }
  } catch (e) {
    // Network error — try legacy verify below (local dev / tests).
    if (!c.jwtSecret) throw e;
  }

  // Legacy fallback: local HS256 verify (old projects + vitest mocks).
  if (c.jwtSecret) {
    return verifyAccessTokenLegacy(accessToken, c.jwtSecret);
  }

  const err = new Error('Invalid Supabase token');
  err.code = 'INVALID_TOKEN';
  throw err;
}

module.exports = { supabaseConfig, isConfigured, verifyAccessToken };

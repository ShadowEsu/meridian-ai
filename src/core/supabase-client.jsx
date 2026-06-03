// Supabase OAuth wiring. Loads after MeridianAPI; both go on window.
// The actual @supabase/supabase-js library is loaded via CDN script in
// Meridian.html as `window.supabase`.
(function () {
  const API = window.MeridianAPI;
  if (!API) {
    console.error('[meridian] supabase-client.jsx loaded before MeridianAPI');
    return;
  }

  let client = null;
  let configPromise = null;
  let exchanging = false;

  async function exchangeMeridianSession(session) {
    if (!session || !session.access_token || exchanging) return;
    exchanging = true;
    try {
      try {
        const me = await API.auth.me();
        if (me && me.user) {
          window.dispatchEvent(new CustomEvent('meridian:auth-changed'));
          return;
        }
      } catch (_) { /* not signed in yet */ }

      await API.post('/api/auth/supabase-session', { accessToken: session.access_token });

      if (location.hash && (location.hash.includes('access_token') || location.hash.includes('refresh_token'))) {
        history.replaceState({}, '', location.pathname + location.search);
      }
      window.dispatchEvent(new CustomEvent('meridian:auth-changed'));
    } catch (e) {
      console.error('[meridian] supabase-session exchange failed', e);
      const msg = (e && e.data && e.data.error) || (e && e.message) || 'Could not establish session';
      window.dispatchEvent(new CustomEvent('meridian:auth-error', { detail: { message: msg, status: e && e.status } }));
    } finally {
      exchanging = false;
    }
  }

  function ensureConfig() {
    if (!configPromise) {
      configPromise = API.get('/api/auth/config').catch((e) => {
        console.warn('[meridian] /api/auth/config failed', e);
        return { googleEnabled: false };
      });
    }
    return configPromise;
  }

  async function ensureClient() {
    const cfg = await ensureConfig();
    if (!cfg.googleEnabled) return null;
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.warn('[meridian] window.supabase missing — CDN script may have failed');
      return null;
    }
    if (!client) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
          autoRefreshToken: true,
          // PKCE (default) — more reliable than implicit on production HTTPS
        },
      });

      client.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && session.access_token) {
          await exchangeMeridianSession(session);
        }
      });

      // OAuth return: hash or ?code= may arrive before onAuthStateChange fires
      const { data: { session: initial } } = await client.auth.getSession();
      if (initial && initial.access_token) {
        await exchangeMeridianSession(initial);
      }
    }
    return client;
  }

  API.auth.googleEnabled = async () => {
    const cfg = await ensureConfig();
    return !!cfg.googleEnabled;
  };

  API.auth.signInWithGoogle = async () => {
    const c = await ensureClient();
    if (!c) {
      throw new Error('Google sign-in is not configured. See docs/SUPABASE_SETUP.md.');
    }
    const redirect = location.origin + '/';
    const { error } = await c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirect },
    });
    if (error) throw error;
  };

  API.auth.signOut = async () => {
    try {
      if (client) await client.auth.signOut();
    } catch (e) { /* ignore — we still clear server-side */ }
    await API.auth.logout();
    window.dispatchEvent(new CustomEvent('meridian:auth-changed'));
  };

  // Auto-init on first load so an OAuth redirect is processed immediately.
  // We don't await this; it's fire-and-forget.
  ensureClient().catch(() => {});
})();

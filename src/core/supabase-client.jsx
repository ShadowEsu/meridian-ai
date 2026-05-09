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
          detectSessionInUrl: true,    // parses #access_token=… on redirect
          autoRefreshToken: true,
          flowType: 'implicit',
        },
      });

      // Whenever Supabase considers the user signed in, hand the access token
      // to our backend so it can mint a meridian_session cookie.
      client.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session && session.access_token) {
          try {
            await API.post('/api/auth/supabase-session', { accessToken: session.access_token });
            // Strip the OAuth fragment from the URL.
            if (location.hash && location.hash.includes('access_token')) {
              history.replaceState({}, '', location.pathname + location.search);
            }
            // Tell the rest of the app the user identity changed.
            window.dispatchEvent(new CustomEvent('meridian:auth-changed'));
          } catch (e) {
            console.error('[meridian] supabase-session exchange failed', e);
          }
        }
      });
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
    const redirect = location.origin + '/?live=1';
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

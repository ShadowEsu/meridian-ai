// Minimal fetch wrapper for the Meridian API. Loaded as raw JSX before pages.
(function () {
  // Live mode is whatever MERIDIAN_LIVE is at call time (auto-detect in
  // Meridian.html may flip it after this file loads — we check on every
  // call rather than caching at module scope).

  async function call(method, path, body) {
    const init = {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data && data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  const API = {
    get live() { return !!window.MERIDIAN_LIVE; },
    get:    (p)         => call('GET', p),
    post:   (p, b)      => call('POST', p, b),
    put:    (p, b)      => call('PUT', p, b),
    del:    (p)         => call('DELETE', p),

    auth: {
      me:     () => call('GET',  '/api/auth/me'),
      login:  (email, password) => call('POST', '/api/auth/login',  { email, password }),
      signup: (email, password) => call('POST', '/api/auth/signup', { email, password }),
      logout: () => call('POST', '/api/auth/logout'),
    },
    teams: {
      list:   () => call('GET',  '/api/teams'),
      create: (b) => call('POST', '/api/teams', b),
      update: (id, b) => call('PUT', `/api/teams/${id}`, b),
      delete: (id) => call('DELETE', `/api/teams/${id}`),
    },
    providerKeys: {
      list:   () => call('GET',  '/api/provider-keys'),
      create: (b) => call('POST', '/api/provider-keys', b),
      delete: (id) => call('DELETE', `/api/provider-keys/${id}`),
    },
    virtualKeys: {
      list:   () => call('GET',  '/api/virtual-keys'),
      create: (b) => call('POST', '/api/virtual-keys', b),
      update: (id, b) => call('PUT', `/api/virtual-keys/${id}`, b),
      delete: (id) => call('DELETE', `/api/virtual-keys/${id}`),
    },
    agents: {
      list:   () => call('GET',  '/api/agents'),
      create: (b) => call('POST', '/api/agents', b),
      update: (id, b) => call('PUT', `/api/agents/${id}`, b),
      delete: (id) => call('DELETE', `/api/agents/${id}`),
      startRun: (id) => call('POST', `/api/agents/${id}/runs`),
      patchRun: (id, runId, b) => call('PUT', `/api/agents/${id}/runs/${runId}`, b),
      runs:     (id) => call('GET',  `/api/agents/${id}/runs`),
    },
    alerts: {
      list:   () => call('GET',  '/api/alerts'),
      create: (b) => call('POST', '/api/alerts', b),
      update: (id, b) => call('PUT', `/api/alerts/${id}`, b),
      delete: (id) => call('DELETE', `/api/alerts/${id}`),
    },
    requests: {
      list: (params) => {
        const qs = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null)).toString();
        return call('GET', `/api/requests${qs ? `?${qs}` : ''}`);
      },
    },
    kpi: {
      overview: () => call('GET', '/api/kpi/overview'),
      feed:     () => call('GET', '/api/kpi/feed'),
    },
    auditLog: {
      list: (limit) => call('GET', `/api/audit-log${limit ? `?limit=${limit}` : ''}`),
    },
    models: {
      list: () => call('GET', '/api/models'),
    },
    router: {
      catalog: () => call('GET', '/api/router/catalog'),
      preview: (prompt, taskTypeHint, constraints) =>
        call('POST', '/api/router/preview', { prompt, taskTypeHint, constraints }),
    },
  };

  /**
   * Shared list-resource hook. Fetches from `loader` when live, returns `fallback` in demo mode.
   * Exposes `refresh()` so create/delete handlers can re-fetch without a page reload.
   * @param {() => Promise<any>} loader - async function that returns the resource list
   * @param {any} fallback - value to use in demo mode (window.MERIDIAN.* slice)
   * @returns {{ items: any, error: Error|null, refresh: () => void }}
   */
  API.useList = function useList(loader, fallback) {
    const [items, setItems] = React.useState(fallback);
    const [error, setError] = React.useState(null);
    const [version, setVersion] = React.useState(0);
    React.useEffect(() => {
      if (!API.live) { setItems(fallback); return; }
      let alive = true;
      loader()
        .then(d => { if (alive) setItems(d); })
        .catch(e => { if (alive) setError(e); });
      return () => { alive = false; };
    }, [version, API.live]);
    return { items, error, refresh: () => setVersion(v => v + 1) };
  };

  window.MeridianAPI = API;
})();

// Minimal fetch wrapper for the Meridian API. Loaded as raw JSX before pages.
(function () {
  const live = !!window.MERIDIAN_LIVE;

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
    live,
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
  };

  window.MeridianAPI = API;
})();

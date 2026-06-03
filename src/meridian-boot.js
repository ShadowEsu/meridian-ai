/**
 * Production-safe JSX loader — fetches each file in order, transforms with
 * Babel, then evals. External <script type="text/babel" src="…"> tags are
 * async and can race on slow networks (Render free tier); this avoids that.
 */
(function () {
  const FILES = [
    '/src/core/data.jsx',
    '/src/core/api.jsx',
    '/src/core/supabase-client.jsx',
    '/src/core/icons.jsx',
    '/src/core/charts.jsx',
    '/src/core/ui-actions.jsx',
    '/src/core/shell.jsx',
    '/src/pages/auth.jsx',
    '/src/pages/overview.jsx',
    '/src/pages/feed.jsx',
    '/src/pages/logs.jsx',
    '/src/pages/agents.jsx',
    '/src/pages/keys.jsx',
    '/src/pages/alerts.jsx',
    '/src/pages/onboarding.jsx',
    '/src/pages/stubs.jsx',
    '/src/pages/models.jsx',
    '/src/pages/ops-pages.jsx',
    '/src/app.jsx',
  ];

  async function loadAll() {
    if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
      meridianShowBootError('React did not load — check /node_modules/ scripts');
      return;
    }
    if (typeof Babel === 'undefined') {
      meridianShowBootError('Babel did not load — check /node_modules/@babel/standalone');
      return;
    }
    try {
      for (const file of FILES) {
        const res = await fetch(file, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Failed to load ' + file + ' (HTTP ' + res.status + ')');
        const code = await res.text();
        const out = Babel.transform(code, { presets: ['react'] }).code;
        (0, eval)(out);
      }
    } catch (e) {
      meridianShowBootError((e && e.message) || String(e));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAll);
  } else {
    loadAll();
  }
})();

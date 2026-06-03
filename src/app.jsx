// Frontend-only demo: sample data in data.jsx (no sign-in, no backend).
const DEMO_USER = { id: 'demo', email: 'demo@meridian.local' };

// In live mode (?live=1 or localStorage meridian_live=1) the app calls
// /api/auth/me on boot and shows PageAuth until the user is signed in.
// In demo mode it renders straight to the dashboard with DEMO_USER.
function useAuthGate() {
  // Track live mode reactively so the async auto-detect in Meridian.html
  // can flip us from demo → live after first paint.
  const [live, setLive] = React.useState(!!(window.MeridianAPI && window.MeridianAPI.live));
  React.useEffect(() => {
    const onLive = () => setLive(true);
    window.addEventListener('meridian:live-detected', onLive);
    return () => window.removeEventListener('meridian:live-detected', onLive);
  }, []);

  const [state, setState] = React.useState(
    live ? { phase: 'loading', user: null } : { phase: 'ready', user: DEMO_USER }
  );

  const refresh = React.useCallback(() => {
    if (!live) return;
    setState({ phase: 'loading', user: null });
    window.MeridianAPI.auth.me()
      .then(d => setState({ phase: 'ready', user: d.user }))
      .catch(e => {
        if (e && e.status === 401) setState({ phase: 'signin', user: null });
        else setState({ phase: 'error', user: null, error: e });
      });
  }, [live]);

  React.useEffect(() => {
    if (!live) {
      setState({ phase: 'ready', user: DEMO_USER });
      return;
    }
    refresh();
    const onChange = () => refresh();
    window.addEventListener('meridian:auth-changed', onChange);
    return () => window.removeEventListener('meridian:auth-changed', onChange);
  }, [live, refresh]);

  return { state, refresh };
}

function AuthenticatedApp({ user }) {
  const [page, setPage] = React.useState('overview');
  const [keysFilter, setKeysFilter] = React.useState('');
  const [showSetup, setShowSetup] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('meridian_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [sideWidth, setSideWidth] = React.useState(() => {
    try {
      const w = parseInt(localStorage.getItem('meridian_sidebar_w'), 10);
      return Number.isFinite(w) && w >= 200 && w <= 320 ? w : 248;
    } catch { return 248; }
  });

  React.useEffect(() => {
    try { localStorage.setItem('meridian_sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  React.useEffect(() => {
    const k = 'meridian_setup_v1_' + user.id;
    try {
      setShowSetup(!localStorage.getItem(k));
    } catch {
      setShowSetup(true);
    }
  }, [user.id]);

  // ⌘B / Ctrl+B toggles the sidebar
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setCollapsed(c => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stub-page CTAs use a custom event to navigate (avoids prop-drilling).
  React.useEffect(() => {
    const onNav = (e) => { if (e.detail) setPage(e.detail); };
    window.addEventListener('meridian:nav', onNav);
    return () => window.removeEventListener('meridian:nav', onNav);
  }, []);

  const M = window.MERIDIAN;
  const setPageNav = (p) => { setPage(p); if (p !== 'keys') setKeysFilter(''); };

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`} style={{ '--sidebar-w': (collapsed ? 68 : sideWidth) + 'px' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {typeof ToastHost !== 'undefined' ? <ToastHost /> : null}
      {showSetup ? <SetupWizard user={user} onDone={() => setShowSetup(false)} /> : null}
      <Sidebar
        page={page}
        setPage={setPageNav}
        user={user}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        sideWidth={sideWidth}
        onSideResize={setSideWidth}
      />
      <main className="main" id="main-content" tabIndex="-1" key={page}>
        {M.uiDemoSampleData ? (
          <div className="demo-data-ribbon">
            <span className="demo-data-pill">Sample data</span>
            <span className="demo-data-text">Illustrative numbers for preview — connect live keys for real spend.</span>
          </div>
        ) : null}
        {page === 'overview' && <PageOverview />}
        {page === 'feed' && <PageLiveFeed />}
        {page === 'logs' && <PageRequestLogs />}
        {page === 'agents' && <PageAgents />}
        {page === 'keys' && <PageKeys keysFilter={keysFilter} />}
        {page === 'alerts' && <PageAlerts />}
        {page === 'models' && <PageModels />}
        {page === 'teams' && <PageTeams />}
        {page === 'routing' && <PageRoutingRules />}
        {page === 'cache' && <PageCache />}
        {page === 'billing' && <PageBilling />}
        {page === 'integrations' && <PageIntegrations />}
        {page === 'settings' && <PageSettings />}
      </main>
    </div>
  );
}

function App() {
  const { state, refresh } = useAuthGate();
  if (state.phase === 'loading') {
    return (
      <div className="meridian-loading-screen">
        <p>Loading Meridian…</p>
      </div>
    );
  }
  if (state.phase === 'signin') {
    return <PageAuth onAuthed={() => refresh()} />;
  }
  if (state.phase === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', padding: 24, color: '#fda4af', fontFamily: 'Crimson Pro, serif', textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Could not reach the API</p>
        <p style={{ margin: 0, fontSize: 13, color: '#9097a3' }}>{(state.error && state.error.message) || 'unknown error'}</p>
      </div>
    );
  }
  return <AuthenticatedApp user={state.user} />;
}

(function boot() {
  const el = document.getElementById('root');
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    el.innerHTML =
      '<div style="min-height:100vh;display:grid;place-content:center;padding:24px;background:#0a0b0d;color:#fda4af;font-family:\'Crimson Pro\',Georgia,serif;max-width:480px;margin:0 auto;text-align:center"><p style="margin:0 0 8px;font-weight:600;color:#e6e8ec">React did not load</p><p style="margin:0;font-size:13px;color:#9097a3">From the project folder run <code style="background:#161922;padding:2px 6px;border-radius:4px">npm install</code> then open this page via <code style="background:#161922;padding:2px 6px;border-radius:4px">npm start</code> or Live Server so <code style="background:#161922;padding:2px 6px;border-radius:4px">/node_modules/…</code> scripts load.</p></div>';
    return;
  }
  try {
    ReactDOM.createRoot(el).render(<App />);
  } catch (e) {
    el.innerHTML =
      '<div style="min-height:100vh;display:grid;place-content:center;padding:24px;background:#0a0b0d;color:#fda4af;font-family:\'Crimson Pro\',Georgia,serif"><p style="margin:0 0 8px;font-weight:600">Meridian failed to start</p><p style="margin:0;color:#e6e8ec;font-size:14px">' +
      String(e && e.message ? e.message : e) +
      '</p></div>';
  }
})();

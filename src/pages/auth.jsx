// Login / signup screen. Wired into app.jsx as the auth gate when MERIDIAN_LIVE=true.
function PageAuth({ onAuthed }) {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState(false);
  const [googleBusy, setGoogleBusy] = React.useState(false);

  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.auth.googleEnabled) return;
    let alive = true;
    window.MeridianAPI.auth.googleEnabled()
      .then(b => { if (alive) setGoogleAvailable(!!b); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const onGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      await window.MeridianAPI.auth.signInWithGoogle();
      // signInWithGoogle redirects; we won't actually reach this line.
    } catch (e) {
      setError(e.message || 'Could not start Google sign-in.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const submit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const sameOriginHint =
      'Use the URL from npm start (same host and port as this page). Opening Meridian.html from disk or Live Server while the API runs on another port breaks /api/auth.';

    try {
      const r = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const text = await r.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!r.ok) {
        const code = `HTTP ${r.status}`;
        const fromApi = data.error || data.message;
        const bodySnippet =
          text && text.length > 0 && text.length < 400 && !/^\s*</.test(text)
            ? text.trim()
            : '';
        setError(
          fromApi ||
            (bodySnippet ? `${bodySnippet} (${code})` : null) ||
            (r.status === 404
              ? `No API at ${path} (${code}). ${sameOriginHint}`
              : `${code}. ${fromApi ? '' : sameOriginHint}`.trim())
        );
        return;
      }
      if (!data.user) {
        setError('Unexpected response (missing user). Try again or check the server log.');
        return;
      }
      onAuthed(data.user, { isNew: !!data.isNew });
    } catch {
      setError(
        'Network error — could not reach the server. From the project folder run: npm install && npm start, then open the URL shown (e.g. http://localhost:5500). ' +
          sameOriginHint
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-visual">
        <div className="auth-visual-inner">
          <div className="auth-orbit" aria-hidden="true">
            <div className="auth-orbit-ring" />
            <div className="auth-orbit-ring r2" />
            <div className="auth-orbit-dot" />
          </div>
          <div className="auth-visual-brand">
            <div className="auth-visual-logo">{Icon.logo()}</div>
            <h1 className="auth-visual-title">Meridian</h1>
            <p className="auth-visual-tag">AI cost intelligence · routing · fleet</p>
          </div>
          <ul className="auth-feature-list">
            <li><span className="auth-check">✓</span> Encrypted provider keys on your server</li>
            <li><span className="auth-check">✓</span> Session cookies (JWT) — no tokens in localStorage</li>
            <li><span className="auth-check">✓</span> Sample dashboard while you wire real data</li>
          </ul>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-panel-card">
          <div className="auth-panel-head">
            <p className="auth-eyebrow">{mode === 'login' ? 'Welcome back' : 'Create workspace'}</p>
            <h2 className="auth-heading">{mode === 'login' ? 'Sign in' : 'Sign up'}</h2>
            <p className="auth-sub">
              {mode === 'login'
                ? 'Use the email and password you registered with.'
                : 'Accounts are stored in data/meridian-store.json on this machine.'}
            </p>
          </div>

          {googleAvailable ? (
            <div style={{ marginBottom: 14 }}>
              <button
                type="button"
                onClick={onGoogle}
                disabled={googleBusy}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  width: '100%', padding: '11px 14px', borderRadius: 10,
                  border: '1px solid #2a2f3a', background: '#0f1218', color: '#e6e8ec',
                  fontSize: 14, fontWeight: 500, cursor: googleBusy ? 'wait' : 'pointer',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={e => { if (!googleBusy) e.currentTarget.style.background = '#161922'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0f1218'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
                <span>{googleBusy ? 'Redirecting to Google…' : 'Continue with Google'}</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
                <div style={{ flex: 1, height: 1, background: '#2a2f3a' }} />
                <span style={{ fontSize: 11, color: '#9097a3', letterSpacing: 0.4 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: '#2a2f3a' }} />
              </div>
            </div>
          ) : null}

          <div className="auth-seg">
            <button
              type="button"
              className={'auth-seg-btn' + (mode === 'login' ? ' on' : '')}
              onClick={() => { setMode('login'); setError(''); }}
            >
              Log in
            </button>
            <button
              type="button"
              className={'auth-seg-btn' + (mode === 'signup' ? ' on' : '')}
              onClick={() => { setMode('signup'); setError(''); }}
            >
              Sign up
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {error ? <div className="auth-error" role="alert">{error}</div> : null}

            <label className="auth-label">
              <span>Email</span>
              <input
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="auth-label">
              <span>Password</span>
              <input
                className="auth-input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 8 : 1}
              />
            </label>

            {mode === 'signup' ? (
              <p className="auth-micro">Password must be 8+ characters. This is a demo backend — use a unique password you do not reuse elsewhere.</p>
            ) : null}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? <span className="auth-spinner" /> : null}
              <span>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</span>
            </button>
          </form>
        </div>
        <p className="auth-foot">Meridian · sample UI data until you connect live metrics</p>
      </div>
    </div>
  );
}

window.PageAuth = PageAuth;

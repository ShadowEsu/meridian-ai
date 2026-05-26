// Login / signup screen. Celestial-orb design with viewfinder readouts.
// Wired into app.jsx as the auth gate when MERIDIAN_LIVE=true.
function PageAuth({ onAuthed }) {
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState(false);
  const [googleBusy, setGoogleBusy] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  // ── Google availability probe ────────────────────────────────────────────
  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.auth.googleEnabled) return;
    let alive = true;
    window.MeridianAPI.auth.googleEnabled()
      .then(b => { if (alive) setGoogleAvailable(!!b); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // ── Live readouts: UTC clock + transit counter ────────────────────────────
  const [utc, setUtc] = React.useState('00:00:00');
  const [transit, setTransit] = React.useState(1847392);
  React.useEffect(() => {
    const pad = v => String(v).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      setUtc(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`);
    };
    tick();
    const t1 = setInterval(tick, 1000);
    const t2 = setInterval(() => setTransit(n => n + Math.floor(2 + Math.random() * 9)), 1100);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  // ── Mouse parallax on orb ─────────────────────────────────────────────────
  const orbRef = React.useRef(null);
  React.useEffect(() => {
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const onMove = e => {
      const nx = (e.clientX / window.innerWidth) - 0.5;
      const ny = (e.clientY / window.innerHeight) - 0.5;
      tx = -nx * 18; ty = -ny * 12;
    };
    const loop = () => {
      x += (tx - x) * 0.05; y += (ty - y) * 0.05;
      if (orbRef.current) {
        orbRef.current.style.transform = `translateY(-50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // ── Cmd/Ctrl-Enter submits ────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('auth-form-el')?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Google sign-in ────────────────────────────────────────────────────────
  const onGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      await window.MeridianAPI.auth.signInWithGoogle();
      // signInWithGoogle redirects; we won't reach this line on success.
    } catch (e) {
      const msg = e && e.message ? e.message : 'Could not start Google sign-in.';
      if (/Failed to fetch|NetworkError|Could not resolve|paused|ENOTFOUND/i.test(msg)) {
        setError('Supabase project is unreachable (paused or wrong URL). Restore it at supabase.com/dashboard or update SUPABASE_URL in .env.');
      } else {
        setError(msg);
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  // ── Email / password submit ───────────────────────────────────────────────
  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!email || !/.+@.+\..+/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (password.length < (mode === 'signup' ? 8 : 6)) {
      setError(mode === 'signup' ? 'Password must be at least 8 characters.' : 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const sameOriginHint =
      'Use the URL from npm start (same host and port as this page). Opening Meridian.html from disk or Live Server while the API runs on another port breaks /api/auth.';
    try {
      const r = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const text = await r.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!r.ok) {
        const code = `HTTP ${r.status}`;
        const fromApi = data.error || data.message;
        const bodySnippet = text && text.length > 0 && text.length < 400 && !/^\s*</.test(text) ? text.trim() : '';
        setError(
          fromApi ||
            (bodySnippet ? `${bodySnippet} (${code})` : null) ||
            (r.status === 404
              ? `No API at ${path} (${code}). ${sameOriginHint}`
              : `${code}. ${fromApi ? '' : sameOriginHint}`.trim())
        );
        setLoading(false);
        return;
      }
      if (!data.user) {
        setError('Unexpected response (missing user). Try again or check the server log.');
        setLoading(false);
        return;
      }
      setSuccess(true);
      await new Promise(r => setTimeout(r, 650));
      onAuthed(data.user, { isNew: !!data.isNew });
    } catch {
      setError(
        'Network error — could not reach the server. From the project folder run: npm install && npm start, then open the URL shown (e.g. http://localhost:5500). ' +
          sameOriginHint
      );
      setLoading(false);
    }
  };

  // ── Render: orb sky, viewfinder, readouts, card ──────────────────────────
  return (
    <div className="auth-v2">
      <AuthSky orbRef={orbRef} />
      <AuthViewfinder />
      <AuthReadouts utc={utc} transit={transit} />

      <div className="auth-card-halo" aria-hidden="true" />

      <main className="auth-v2-shell">
        <div className="auth-card-v2" role="main">
          <div className="auth-brand">
            <span className="auth-brand-logo" aria-label="Meridian">{Icon.logo()}</span>
            <span className="auth-brand-nm">Meridian</span>
          </div>

          <div className="auth-head-v2">
            <span className="auth-eyebrow-v2">{mode === 'login' ? 'WELCOME BACK' : 'CREATE WORKSPACE'}</span>
            <h1 className="auth-title-v2">{mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}</h1>
          </div>

          {googleAvailable ? (
            <>
              <button
                type="button"
                className="auth-btn-google"
                onClick={onGoogle}
                disabled={googleBusy}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>{googleBusy ? 'Redirecting to Google…' : 'Continue with Google'}</span>
              </button>

              <div className="auth-or-v2">
                <span className="auth-or-hr" /><span className="auth-or-lbl">OR</span><span className="auth-or-hr" />
              </div>
            </>
          ) : null}

          <div className={'auth-seg-v2' + (mode === 'signup' ? ' signup' : '')} role="tablist" aria-label="Mode">
            <div className="auth-seg-indicator" aria-hidden="true" />
            <button type="button" className={'auth-seg-v2-btn' + (mode === 'login' ? ' on' : '')}
                    onClick={() => { setMode('login'); setError(''); setPassword(''); }}
                    role="tab" aria-selected={mode === 'login'}>Log in</button>
            <button type="button" className={'auth-seg-v2-btn' + (mode === 'signup' ? ' on' : '')}
                    onClick={() => { setMode('signup'); setError(''); setPassword(''); }}
                    role="tab" aria-selected={mode === 'signup'}>Sign up</button>
          </div>

          <form className="auth-form-v2" id="auth-form-el" onSubmit={submit} noValidate>
            <div className={'auth-err-v2' + (error ? ' show' : '')} role="alert" aria-live="polite">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5"/><path d="M8 5v3.5"/><circle cx="8" cy="11" r=".5" fill="currentColor"/>
              </svg>
              <span>{error || ' '}</span>
            </div>

            <div className={'auth-field-v2' + (email ? ' has-value' : '')}>
              <input
                type="email"
                id="auth-email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder=" "
                autoComplete="email"
                required
              />
              <label htmlFor="auth-email">Email</label>
            </div>

            <div className={'auth-field-v2' + (password ? ' has-value' : '')}>
              <input
                type={showPw ? 'text' : 'password'}
                id="auth-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder=" "
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'signup' ? 8 : 6}
              />
              <label htmlFor="auth-password">Password</label>
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPw(s => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7-10.5-7-10.5-7z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>

            <div className="auth-form-meta">
              {mode === 'login' ? (
                <>
                  <label className="auth-remember"><input type="checkbox" /> <span>Stay signed in</span></label>
                  <a href="#" onClick={e => { e.preventDefault(); setError('Password reset is not wired up yet — DM Aadi or recreate the account.'); }}>Forgot password?</a>
                </>
              ) : (
                <span className="auth-micro-v2">Password must be 8+ characters.</span>
              )}
            </div>

            <button type="submit" className={'auth-btn-primary-v2' + (loading ? ' loading' : '')} disabled={loading}>
              <span className="auth-lbl">{mode === 'login' ? 'Sign in' : 'Create workspace'}</span>
              <span className="auth-arrow" aria-hidden="true">→</span>
              <span className="auth-spinner-v2" aria-hidden="true" />
            </button>
          </form>
        </div>
      </main>

      <div className={'auth-success-overlay' + (success ? ' on' : '')} aria-hidden="true" />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function AuthSky({ orbRef }) {
  const minorTicks = React.useMemo(() => {
    const cx = 400, cy = 400, inner = 320, outer = 332;
    const ticks = [];
    for (let a = 0; a < 360; a += 5) {
      if (a % 30 === 0) continue;
      const rad = (a - 90) * Math.PI / 180;
      ticks.push({
        x1: cx + Math.cos(rad) * inner,
        y1: cy + Math.sin(rad) * inner,
        x2: cx + Math.cos(rad) * outer,
        y2: cy + Math.sin(rad) * outer,
      });
    }
    return ticks;
  }, []);

  return (
    <div className="auth-sky" aria-hidden="true">
      <div className="auth-stars" />
      <div className="auth-orb-wrap" ref={orbRef}>
        <div className="auth-orb-tilt">
          <svg className="auth-orb-svg" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="orbBody" cx="35%" cy="32%" r="78%">
                <stop offset="0%" stopColor="#1F2240" stopOpacity="0.95"/>
                <stop offset="55%" stopColor="#13152A" stopOpacity="0.95"/>
                <stop offset="92%" stopColor="#0A0B17" stopOpacity="0.95"/>
                <stop offset="100%" stopColor="#0A0B0E" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="orbLight" cx="32%" cy="28%" r="38%">
                <stop offset="0%" stopColor="#9097F0" stopOpacity="0.30"/>
                <stop offset="60%" stopColor="#7079E8" stopOpacity="0.07"/>
                <stop offset="100%" stopColor="#7079E8" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="orbAtmo" cx="50%" cy="50%" r="55%">
                <stop offset="80%" stopColor="#7079E8" stopOpacity="0"/>
                <stop offset="92%" stopColor="#7079E8" stopOpacity="0.10"/>
                <stop offset="100%" stopColor="#7079E8" stopOpacity="0"/>
              </radialGradient>
              <clipPath id="orbClip"><circle cx="400" cy="400" r="320"/></clipPath>
              <radialGradient id="frontMask" cx="40%" cy="35%" r="80%">
                <stop offset="0%" stopColor="white" stopOpacity="1"/>
                <stop offset="60%" stopColor="white" stopOpacity="0.55"/>
                <stop offset="100%" stopColor="white" stopOpacity="0.08"/>
              </radialGradient>
              <mask id="frontMaskMask"><circle cx="400" cy="400" r="320" fill="url(#frontMask)"/></mask>
              <linearGradient id="meridianGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9097F0" stopOpacity="0.2"/>
                <stop offset="15%" stopColor="#9097F0" stopOpacity="0.6"/>
                <stop offset="50%" stopColor="#D9DCFA" stopOpacity="0.95"/>
                <stop offset="85%" stopColor="#9097F0" stopOpacity="0.6"/>
                <stop offset="100%" stopColor="#9097F0" stopOpacity="0.2"/>
              </linearGradient>
            </defs>

            <circle cx="400" cy="400" r="360" fill="url(#orbAtmo)"/>

            <g className="auth-orb-rotor-slow">
              <g stroke="rgba(160,162,168,0.30)" strokeWidth="1" fill="none">
                <line x1="400" y1="45" x2="400" y2="60"/>
                <line x1="400" y1="740" x2="400" y2="755"/>
                <line x1="45" y1="400" x2="60" y2="400"/>
                <line x1="740" y1="400" x2="755" y2="400"/>
              </g>
              <g stroke="rgba(160,162,168,0.20)" strokeWidth="0.7" fill="none">
                {minorTicks.map((t, i) => (
                  <line key={i} x1={t.x1.toFixed(2)} y1={t.y1.toFixed(2)} x2={t.x2.toFixed(2)} y2={t.y2.toFixed(2)} />
                ))}
              </g>
            </g>

            <g className="auth-orb-breathe">
              <circle cx="400" cy="400" r="320" fill="url(#orbBody)"/>
              <circle cx="400" cy="400" r="320" fill="url(#orbLight)"/>
              <circle cx="400" cy="400" r="320" fill="none" stroke="rgba(144,151,240,0.20)" strokeWidth="0.7"/>
            </g>

            <g clipPath="url(#orbClip)" mask="url(#frontMaskMask)">
              <g fill="none" stroke="rgba(160,162,168,0.10)" strokeWidth="0.6">
                <ellipse cx="400" cy="400" rx="320" ry="80"/>
                <ellipse cx="400" cy="400" rx="295" ry="160"/>
                <ellipse cx="400" cy="400" rx="248" ry="225"/>
                <ellipse cx="400" cy="400" rx="180" ry="270"/>
                <ellipse cx="400" cy="400" rx="100" ry="305"/>
              </g>

              <g className="auth-orb-rotor" fill="none" stroke="rgba(160,162,168,0.13)" strokeWidth="0.6">
                <ellipse cx="400" cy="400" rx="260" ry="320"/>
                <ellipse cx="400" cy="400" rx="180" ry="320"/>
                <ellipse cx="400" cy="400" rx="80" ry="320"/>
              </g>

              <g>
                <line x1="400" y1="80" x2="400" y2="720" stroke="#9097F0" strokeOpacity="0.18" strokeWidth="6" strokeLinecap="round"/>
                <line x1="400" y1="80" x2="400" y2="720" stroke="url(#meridianGrad)" strokeWidth="1.4" className="auth-meridian-pulse"/>

                <g stroke="#9097F0" strokeOpacity="0.7" strokeWidth="1" fill="none">
                  <line x1="385" y1="400" x2="415" y2="400" strokeOpacity="0.85"/>
                  <line x1="390" y1="240" x2="410" y2="240" strokeOpacity="0.55"/>
                  <line x1="390" y1="560" x2="410" y2="560" strokeOpacity="0.55"/>
                  <line x1="394" y1="160" x2="406" y2="160" strokeOpacity="0.40"/>
                  <line x1="394" y1="640" x2="406" y2="640" strokeOpacity="0.40"/>
                  <line x1="395" y1="320" x2="405" y2="320" strokeOpacity="0.30"/>
                  <line x1="395" y1="480" x2="405" y2="480" strokeOpacity="0.30"/>
                  <line x1="396" y1="200" x2="404" y2="200" strokeOpacity="0.20"/>
                  <line x1="396" y1="600" x2="404" y2="600" strokeOpacity="0.20"/>
                </g>

                <g fontFamily="'Geist Mono', monospace" fontSize="10" fill="rgba(160,162,168,0.55)" letterSpacing="0.05em">
                  <text x="420" y="403">0°</text>
                  <text x="420" y="243">30°N</text>
                  <text x="420" y="563">30°S</text>
                  <text x="420" y="163" fill="rgba(160,162,168,0.35)">60°N</text>
                  <text x="420" y="643" fill="rgba(160,162,168,0.35)">60°S</text>
                </g>

                <g fill="#9097F0">
                  <circle cx="400" cy="80" r="2.2"/>
                  <circle cx="400" cy="720" r="2.2"/>
                </g>
                <g fontFamily="'Geist Mono', monospace" fontSize="9" fill="rgba(160,162,168,0.55)" letterSpacing="0.18em" textAnchor="middle">
                  <text x="400" y="68">N</text>
                  <text x="400" y="740">S</text>
                </g>

                <circle r="3" fill="#D9DCFA">
                  <animate attributeName="cy" values="80;720" dur="10s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="10s" repeatCount="indefinite"/>
                  <animate attributeName="r" values="1.5;3;3;1" keyTimes="0;0.2;0.8;1" dur="10s" repeatCount="indefinite"/>
                </circle>
                <circle r="2.2" fill="#9097F0">
                  <animate attributeName="cy" values="80;720" dur="10s" begin="3s" repeatCount="indefinite"/>
                  <animate attributeName="cx" values="400;400" dur="10s" begin="3s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="10s" begin="3s" repeatCount="indefinite"/>
                  <animate attributeName="r" values="1;2.4;2.4;0.6" keyTimes="0;0.2;0.8;1" dur="10s" begin="3s" repeatCount="indefinite"/>
                </circle>
                <circle r="1.8" fill="#7079E8">
                  <animate attributeName="cy" values="720;80" dur="14s" begin="5s" repeatCount="indefinite"/>
                  <animate attributeName="cx" values="400;400" dur="14s" begin="5s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="14s" begin="5s" repeatCount="indefinite"/>
                </circle>
                <circle r="1.4" fill="#9097F0" opacity="0.8">
                  <animate attributeName="cy" values="80;720" dur="16s" begin="7s" repeatCount="indefinite"/>
                  <animate attributeName="cx" values="400;400" dur="16s" begin="7s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.85;1" dur="16s" begin="7s" repeatCount="indefinite"/>
                </circle>

                <circle cx="400" cy="400" r="6" fill="none" stroke="#9097F0" strokeOpacity="0" strokeWidth="1">
                  <animate attributeName="r" values="6;36;6" dur="10s" repeatCount="indefinite"/>
                  <animate attributeName="stroke-opacity" values="0.6;0;0.6" keyTimes="0;0.5;1" dur="10s" repeatCount="indefinite"/>
                </circle>
              </g>

              <ellipse cx="400" cy="400" rx="320" ry="2" fill="none" stroke="rgba(144,151,240,0.18)" strokeWidth="0.8" strokeDasharray="2 5"/>
            </g>

            <circle cx="400" cy="400" r="320" fill="none" stroke="rgba(144,151,240,0.28)" strokeWidth="0.8"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

function AuthViewfinder() {
  return (
    <div className="auth-viewfinder" aria-hidden="true">
      <span className="auth-vf-bracket tl" />
      <span className="auth-vf-bracket tr" />
      <span className="auth-vf-bracket bl" />
      <span className="auth-vf-bracket br" />
    </div>
  );
}

function AuthReadouts({ utc, transit }) {
  return (
    <div className="auth-readouts" aria-hidden="true">
      <div className="auth-readout r-tl">
        <div className="row"><span className="lbl">MERIDIAN</span></div>
        <div className="row"><span className="k">LON</span><span className="v">000° 00&apos; 00&quot;</span></div>
        <div className="row"><span className="k">LAT</span><span className="v">51° 28&apos; 40&quot; N</span></div>
      </div>
      <div className="auth-readout r-tr">
        <div className="row"><span className="lbl">UTC</span><span className="v">{utc}</span></div>
        <div className="row"><span className="pdot" /><span className="k">ROUTING</span><span className="v">healthy</span></div>
      </div>
      <div className="auth-readout r-bl">
        <div className="row"><span className="lbl">TRANSITS / 24H</span></div>
        <div className="row"><span className="v tnum">{transit.toLocaleString()}</span></div>
      </div>
      <div className="auth-readout r-br">
        <div className="row"><span className="lbl">SAVED MTD</span></div>
        <div className="row"><span className="v tnum">− $14,200</span></div>
      </div>
    </div>
  );
}

window.PageAuth = PageAuth;

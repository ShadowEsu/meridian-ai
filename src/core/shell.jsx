// Sidebar — refined system (variant-i)
// Left rail with dotted M + canvas sparkles, 13 nav items in 2 sections,
// collapsible via ⌘B or the chevron button.

const SIDE_ICONS = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5"/>
      <rect x="14" y="3" width="7" height="5" rx="1.5"/>
      <rect x="14" y="12" width="7" height="9" rx="1.5"/>
      <rect x="3" y="16" width="7" height="5" rx="1.5"/>
    </svg>
  ),
  spend: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l4-6 4 4 4-7 6 9"/>
      <circle cx="7" cy="11" r="1.6"/><circle cx="11" cy="15" r="1.6"/>
      <circle cx="15" cy="8" r="1.6"/><circle cx="21" cy="17" r="1.6"/>
    </svg>
  ),
  models: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/>
      <circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/>
      <path d="M6 7l4 4M18 7l-4 4M6 17l4-4M18 17l-4-4"/>
    </svg>
  ),
  routing: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12c4-7 14-7 18 0M3 12c4 7 14 7 18 0"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  teams: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/>
      <path d="M3 20c0-3 3-5 6-5s6 2 6 5M14 20c0-2 2-4 4.5-4s4.5 2 4.5 4"/>
    </svg>
  ),
  live: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c4-4 6-4 10 0s6 4 10 0"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    </svg>
  ),
  cache: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="8" ry="3"/>
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>
    </svg>
  ),
  agent: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
  alerts: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/>
      <path d="M10 21a2 2 0 0 0 4 0"/>
    </svg>
  ),
  audit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="M3 9h18M8 4v5M16 4v5"/>
    </svg>
  ),
  keys: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="14" r="4"/>
      <path d="M11 13l9-9M17 7l3 3"/>
    </svg>
  ),
  billing: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="13" rx="2"/>
      <path d="M2 11h20M6 16h2"/>
    </svg>
  ),
  integrations: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.6 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>
  ),
};

const NAV_WORKSPACE = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'models',   label: 'Models',   icon: 'models'   },
  { id: 'routing',  label: 'Smart router', icon: 'routing', badge: 'ML' },
  { id: 'teams',    label: 'Teams',    icon: 'teams'    },
  { id: 'feed',     label: 'Live',     icon: 'live',    liveDot: true },
  { id: 'cache',    label: 'Cache',    icon: 'cache'    },
];
const NAV_OPS = [
  { id: 'alerts',       label: 'Alerts',       icon: 'alerts', badge: '2', warn: true },
  { id: 'agents',       label: 'Agents',       icon: 'agent' },
  { id: 'logs',         label: 'Audit log',    icon: 'audit' },
  { id: 'keys',         label: 'API keys',     icon: 'keys' },
  { id: 'billing',      label: 'Billing',      icon: 'billing' },
  { id: 'integrations', label: 'Integrations', icon: 'integrations' },
  { id: 'settings',     label: 'Settings',     icon: 'settings' },
];

function Sidebar({ page, setPage, user, collapsed, onToggle, sideWidth, onSideResize }) {
  const resizeRef = React.useRef({ dragging: false, startX: 0, startW: 240 });

  React.useEffect(() => {
    function onMove(e) {
      if (!resizeRef.current.dragging || collapsed) return;
      const dx = e.clientX - resizeRef.current.startX;
      const next = Math.round(Math.min(320, Math.max(200, resizeRef.current.startW + dx)));
      onSideResize && onSideResize(next);
    }
    function onUp() {
      if (!resizeRef.current.dragging) return;
      resizeRef.current.dragging = false;
      document.body.classList.remove('sidebar-resizing');
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [collapsed, onSideResize]);

  function startResize(e) {
    if (collapsed) return;
    e.preventDefault();
    resizeRef.current = { dragging: true, startX: e.clientX, startW: sideWidth || 240 };
    document.body.classList.add('sidebar-resizing');
  }

  function renderItem(it) {
    const targetId = it.alias || it.id;
    const isActive = page === targetId;
    return (
      <button
        type="button"
        key={it.label}
        className={`nav-item ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => setPage(targetId)}
        title={collapsed ? it.label : undefined}
      >
        <span className="ic" aria-hidden="true">{SIDE_ICONS[it.icon]}</span>
        <span className="label">{it.label}</span>
        {it.badge ? (
          <span
            className={`nav-badge${it.warn ? ' warn' : ''}`}
            aria-label={`${it.badge} ${it.label.toLowerCase()}`}
          >
            {it.badge}
          </span>
        ) : null}
        {it.liveDot ? (
          <span className="nav-badge" aria-label="Live">
            <span
              style={{
                display: 'inline-block', width: 5, height: 5, borderRadius: 999,
                background: 'var(--good)', boxShadow: '0 0 6px var(--good)',
                marginRight: 4, verticalAlign: 'middle',
              }}
            />
            on
          </span>
        ) : null}
      </button>
    );
  }

  const userName = user && user.email ? user.email.split('@')[0] : 'demo';
  const userMeta = user && user.email ? user.email : 'demo@meridian.local';
  const initial = (userName[0] || 'M').toUpperCase();

  return (
    <aside className="sidebar" aria-label="Primary navigation" style={collapsed ? undefined : { width: sideWidth }}>
      <div
        className="side-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize sidebar"
        onMouseDown={startResize}
      />
      <div className="side-head">
        <div className="logo" aria-hidden="true">
          {Icon.logo()}
        </div>
        <span className="brand-name">Meridian</span>
        <button
          type="button"
          className="side-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title="Collapse sidebar (⌘B)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>

      <nav className="nav" aria-label="Workspace">
        <span className="side-section">Workspace</span>
        {NAV_WORKSPACE.map(renderItem)}
      </nav>

      <nav className="nav" aria-label="Operations">
        <span className="side-section">Operations</span>
        {NAV_OPS.map(renderItem)}
      </nav>

      <div className="side-spacer" />

      <div className="side-foot">
        <div className="avatar" aria-hidden="true">{initial}</div>
        <div className="who">
          <span className="nm">{userName}</span>
          <span className="em">{userMeta}</span>
        </div>
      </div>
    </aside>
  );
}

// Global search popover (unchanged from previous version)
function GlobalSearch({ setPage, setFleetSelected, setKeysFilter }) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const results = React.useMemo(() => {
    const query = q.toLowerCase().trim();
    const models = window.MERIDIAN.MODELS.filter(m =>
      !query || m.name.toLowerCase().includes(query) || m.family.includes(query)
    );
    const keys = window.MERIDIAN.VIRTUAL_KEYS.filter(k =>
      !query || k.name.toLowerCase().includes(query) || k.team.toLowerCase().includes(query) || k.mask.toLowerCase().includes(query)
    );
    const teams = window.MERIDIAN.TEAMS.filter(t =>
      !query || t.name.toLowerCase().includes(query)
    );
    return { models: models.slice(0, 6), keys: keys.slice(0, 6), teams: teams.slice(0, 4) };
  }, [q]);

  const total = results.models.length + results.keys.length + results.teams.length;

  return (
    <div className="search">
      <span className="search-icon" aria-hidden="true">{Icon.search()}</span>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        aria-label="Search models, API keys, and teams"
        placeholder="Search models, API keys, teams..."
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      <span className="search-kbd">⌘K</span>

      {open && (
        <div className="search-popover">
          {total === 0 && <div className="search-empty">No matches for "{q}"</div>}

          {results.models.length > 0 && (
            <>
              <div className="search-section-title">Models</div>
              {results.models.map(m => (
                <div
                  key={m.id}
                  className="search-result"
                  onMouseDown={() => { setPage('overview'); setOpen(false); setQ(''); }}
                >
                  <div className="search-result-icon" style={{ background: m.color + '22', borderColor: m.color + '55' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }}></div>
                  </div>
                  <div className="search-result-meta">
                    <div className="search-result-title">{m.name}</div>
                    <div className="search-result-sub">{window.MERIDIAN.fmtNum(m.callsMonth)} calls · {window.MERIDIAN.fmtMoney(m.spend)} spend</div>
                  </div>
                  <div className="search-result-tag">Model</div>
                </div>
              ))}
            </>
          )}

          {results.keys.length > 0 && (
            <>
              <div className="search-section-title">API Keys</div>
              {results.keys.map(k => (
                <div
                  key={k.name}
                  className="search-result"
                  onMouseDown={() => { setPage('keys'); setKeysFilter(k.name); setOpen(false); setQ(''); }}
                >
                  <div className="search-result-icon">
                    {Icon.key({ width: 14, height: 14, stroke: 'var(--indigo-2)' })}
                  </div>
                  <div className="search-result-meta">
                    <div className="search-result-title">{k.name}</div>
                    <div className="search-result-sub mono">{k.mask} · {k.team}</div>
                  </div>
                  <div className="search-result-tag">Key</div>
                </div>
              ))}
            </>
          )}

          {results.teams.length > 0 && (
            <>
              <div className="search-section-title">Teams</div>
              {results.teams.map(t => (
                <div
                  key={t.name}
                  className="search-result"
                  onMouseDown={() => { setPage('keys'); setOpen(false); setQ(''); }}
                >
                  <div className="search-result-icon">
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: window.MERIDIAN.TEAM_COLORS[t.name] || '#6366F1' }}></div>
                  </div>
                  <div className="search-result-meta">
                    <div className="search-result-title">{t.name}</div>
                    <div className="search-result-sub">{t.members} members · {window.MERIDIAN.fmtMoney(t.spend)} / {window.MERIDIAN.fmtMoney(t.budget)}</div>
                  </div>
                  <div className="search-result-tag">Team</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Header({ title, sub, search, demo }) {
  return (
    <div className="header">
      <div className="header-projects">
        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>
          {title || 'Dashboard'}
        </div>
        {sub ? (
          <div style={{ color: 'var(--text-faint)', fontWeight: 300, fontSize: 11.5 }}>
            {sub}
          </div>
        ) : null}
      </div>

      <div className="header-search-wrap">
        {search}
      </div>

      <div className="header-actions">
        <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => window.MeridianUI && window.MeridianUI.exportData('Dashboard')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 21h14"/>
          </svg>
          Export
        </button>
        <div
          title={demo ? `Sample data · ${title}` : title}
          style={{
            width: 30, height: 30, borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,.14)',
            background: 'linear-gradient(135deg, #B87A5E, #5D8B7A)',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11.5,
            color: 'rgba(255,255,255,0.95)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          M
        </div>
      </div>
    </div>
  );
}

window.Sidebar = Sidebar;
window.GlobalSearch = GlobalSearch;
window.Header = Header;

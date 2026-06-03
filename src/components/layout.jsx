// Dashboard shell — desktop sidebar + mobile drawer + bottom nav.

(function () {
  const UI = () => window.MeridianUIComponents || {};
  const { SlideIndicator } = window.MeridianMotion || {};

  const NAV_PRIMARY = [
    { id: 'overview', label: 'Overview' },
    { id: 'models', label: 'Models' },
    { id: 'logs', label: 'Requests' },
    { id: 'teams', label: 'Budgets' },
    { id: 'alerts', label: 'Alerts', badge: '2', warn: true },
    { id: 'keys', label: 'API Keys' },
    { id: 'settings', label: 'Settings' },
  ];
  const NAV_MORE = [
    { id: 'routing', label: 'Smart router' },
    { id: 'feed', label: 'Live feed' },
    { id: 'agents', label: 'Agents' },
    { id: 'billing', label: 'Billing' },
  ];
  const BOTTOM_NAV = [
    { id: 'overview', label: 'Home', icon: '▦' },
    { id: 'feed', label: 'Live', icon: '〜' },
    { id: 'keys', label: 'Keys', icon: '⌁' },
    { id: 'routing', label: 'Route', icon: '⇄' },
    { id: '__menu', label: 'Menu', icon: '☰' },
  ];

  const NAV_ICONS = {
    overview: '▦', models: '◎', logs: '≡', teams: '◉', alerts: '◆', keys: '⌁', settings: '⚙',
    routing: '⇄', feed: '〜', agents: '⬡', billing: '¤',
  };

  function useIsMobile(bp) {
    const max = (bp || 768) - 1;
    const [mobile, setMobile] = React.useState(() =>
      typeof window !== 'undefined' && window.matchMedia(`(max-width: ${max}px)`).matches
    );
    React.useEffect(() => {
      const mq = window.matchMedia(`(max-width: ${max}px)`);
      const fn = () => setMobile(mq.matches);
      fn();
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    }, [max]);
    return mobile;
  }

  function useTheme() {
    const [theme, setTheme] = React.useState(() => {
      try { return localStorage.getItem('meridian_theme') || 'dark'; } catch { return 'dark'; }
    });
    React.useEffect(() => {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem('meridian_theme', theme); } catch {}
    }, [theme]);
    return { theme, toggle: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) };
  }

  function SidebarNav({ page, setPage, collapsed, forceLabels }) {
    const navRef = React.useRef(null);
    const [indicator, setIndicator] = React.useState({ top: 0, height: 32 });
    const showLabels = forceLabels || !collapsed;

    React.useEffect(() => {
      const root = navRef.current;
      if (!root) return;
      const active = root.querySelector('[aria-current="page"]');
      if (!active) return;
      const pr = root.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      setIndicator({ top: ar.top - pr.top, height: ar.height });
    }, [page, collapsed, forceLabels]);

    function renderItem(it) {
      const isActive = page === it.id;
      return (
        <button
          key={it.id}
          type="button"
          className={[
            'relative flex w-full min-h-[40px] items-center gap-3 rounded-none px-3 py-2 text-sm font-medium transition-colors duration-150 border-l-2',
            isActive ? 'm-nav-active border-l-accent text-txt-primary' : 'border-l-transparent text-txt-secondary hover:bg-[#1C2130]/60 hover:text-txt-primary',
            !showLabels ? 'justify-center px-2' : '',
          ].join(' ')}
          aria-current={isActive ? 'page' : undefined}
          title={!showLabels ? it.label : undefined}
          onClick={() => setPage(it.id)}
        >
          <span className="w-5 shrink-0 text-center text-sm opacity-80" aria-hidden="true">{NAV_ICONS[it.id] || '·'}</span>
          {showLabels ? <span className="truncate text-left">{it.label}</span> : null}
          {showLabels && it.badge ? (
            <span className={['ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', it.warn ? 'bg-critical/15 text-critical' : 'bg-white/10 text-txt-muted'].join(' ')}>
              {it.badge}
            </span>
          ) : null}
        </button>
      );
    }

    return (
      <nav ref={navRef} className="relative flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Primary">
        {SlideIndicator && showLabels ? (
          <SlideIndicator style={{ top: indicator.top, height: indicator.height }} />
        ) : null}
        <div className="relative flex flex-col gap-0.5">
          {NAV_PRIMARY.map(renderItem)}
        </div>
        {showLabels ? (
          <div className="relative flex flex-col gap-0.5 border-t pt-4" style={{ borderColor: 'var(--m-hairline)' }}>
            <p className="m-label mb-2 px-3">More</p>
            {NAV_MORE.map(renderItem)}
          </div>
        ) : null}
      </nav>
    );
  }

  function DashboardSidebar({ page, setPage, user, collapsed, onToggle, sideWidth, isMobile, navOpen }) {
    const userName = user && user.email ? user.email.split('@')[0] : 'demo';
    const initial = (userName[0] || 'M').toUpperCase();
    const showLabels = isMobile || !collapsed;

    return (
      <aside
        className={[
          'flex flex-col border-r bg-surface',
          isMobile
            ? [
              'fixed inset-y-0 left-0 z-50 w-[min(300px,88vw)] max-w-full shadow-popover transition-transform duration-200 ease-meridian',
              navOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
            ].join(' ')
            : 'relative z-30 hidden h-screen shrink-0 md:flex',
          !isMobile && collapsed ? 'md:w-[68px]' : '',
        ].join(' ')}
        style={!isMobile && !collapsed ? { width: sideWidth } : undefined}
        aria-label="Sidebar"
        aria-hidden={isMobile && !navOpen ? 'true' : undefined}
      >
        <div
          className={['flex min-h-[56px] items-center gap-3 border-b px-4 py-3', !showLabels ? 'justify-center' : ''].join(' ')}
          style={{ borderColor: 'var(--m-hairline)' }}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold text-accent" style={{ borderColor: 'var(--m-hairline)' }}>
            M
          </div>
          {showLabels ? (
            <>
              <span className="truncate text-sm font-semibold">Meridian</span>
              <button
                type="button"
                className="ml-auto m-btn-ghost !px-2 !py-1 text-xs"
                onClick={isMobile ? onToggle : onToggle}
                aria-label={isMobile ? 'Close menu' : 'Collapse sidebar'}
              >
                {isMobile ? '✕' : '⌘B'}
              </button>
            </>
          ) : (
            <button type="button" className="sr-only" onClick={onToggle}>Expand</button>
          )}
        </div>

        <SidebarNav page={page} setPage={setPage} collapsed={collapsed} forceLabels={isMobile} />

        <div className={['shrink-0 border-t p-3', !showLabels ? 'flex justify-center' : ''].join(' ')} style={{ borderColor: 'var(--m-hairline)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold">{initial}</div>
            {showLabels ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-xs text-txt-muted">{user && user.email}</p>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    );
  }

  function MobileBottomNav({ page, onNavigate, onMenu }) {
    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t bg-surface/95 backdrop-blur-md md:hidden"
        style={{ borderColor: 'var(--m-hairline)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Quick navigation"
      >
        {BOTTOM_NAV.map(item => {
          const isMenu = item.id === '__menu';
          const isActive = !isMenu && page === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={[
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[10px] font-medium transition-colors',
                isActive ? 'text-accent' : 'text-txt-muted',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => (isMenu ? onMenu() : onNavigate(item.id))}
            >
              <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  function CommandPalette({ setPage, setKeysFilter, open, onClose }) {
    const [q, setQ] = React.useState('');
    const inputRef = React.useRef(null);
    const { StatusPill } = UI();

    React.useEffect(() => {
      if (open) {
        setQ('');
        setTimeout(() => inputRef.current && inputRef.current.focus(), 40);
      }
    }, [open]);

    const results = React.useMemo(() => {
      const M = window.MERIDIAN;
      if (!M) return { models: [], keys: [], pages: [] };
      const query = q.toLowerCase().trim();
      const models = M.MODELS.filter(m => !query || m.name.toLowerCase().includes(query)).slice(0, 5);
      const keys = M.VIRTUAL_KEYS.filter(k => !query || k.name.toLowerCase().includes(query)).slice(0, 5);
      const pages = [...NAV_PRIMARY, ...NAV_MORE].filter(p => !query || p.label.toLowerCase().includes(query));
      return { models, keys, pages };
    }, [q]);

    if (!open) return null;

    function go(page, extra) {
      setPage(page);
      if (extra && setKeysFilter) setKeysFilter(extra);
      onClose();
    }

    return (
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[12vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={onClose}
      >
        <div
          className="w-full max-h-[85vh] overflow-hidden rounded-t-modal border bg-surface-elevated shadow-popover sm:max-w-lg sm:rounded-modal"
          style={{ borderColor: 'var(--m-hairline)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--m-hairline)' }}>
            <span className="text-txt-muted text-xs">Search</span>
            <input
              ref={inputRef}
              className="min-h-[44px] flex-1 bg-transparent text-base text-txt-primary placeholder:text-txt-muted outline-none sm:text-sm"
              placeholder="Page, model, connection…"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
            />
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-2">
            {results.pages.map(p => (
              <button key={p.id} type="button" className="flex min-h-[44px] w-full items-center justify-between rounded-control px-3 py-2 text-left text-sm hover:bg-white/[0.05]" onClick={() => go(p.id)}>
                {p.label}
                {StatusPill ? <StatusPill tone="muted">Go</StatusPill> : null}
              </button>
            ))}
            {results.models.map(m => (
              <button key={m.id} type="button" className="flex min-h-[44px] w-full items-center justify-between rounded-control px-3 py-2 text-sm hover:bg-white/[0.05]" onClick={() => go('models')}>
                <span className="truncate pr-2">{m.name}</span>
                <span className="m-mono-num shrink-0 text-xs text-txt-muted">Model</span>
              </button>
            ))}
            {results.keys.map(k => (
              <button key={k.name} type="button" className="flex min-h-[44px] w-full items-center justify-between rounded-control px-3 py-2 text-sm hover:bg-white/[0.05]" onClick={() => go('keys', k.name)}>
                <span className="m-mono-num truncate pr-2">{k.name}</span>
                <span className="shrink-0 text-xs text-txt-muted">Key</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function DashboardTopBar({ setPage, setKeysFilter, demo, isMobile, onOpenNav, onOpenSearch, spendLabel, modelFilter, onModelFilter }) {
    const [range, setRange] = React.useState('MTD');
    const [cmdOpen, setCmdOpen] = React.useState(false);
    const [modelOpen, setModelOpen] = React.useState(false);
    const { StatusPill } = UI();
    const models = [
      { id: 'all', label: 'All models' },
      { id: 'claude', label: 'Claude' },
      { id: 'gpt', label: 'GPT-4o' },
      { id: 'gemini', label: 'Gemini' },
    ];
    const modelLabel = models.find(m => m.id === (modelFilter || 'all'))?.label || 'All models';

    React.useEffect(() => {
      const handler = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setCmdOpen(true);
        }
        if (e.key === 'Escape') setCmdOpen(false);
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, []);

    const openSearch = () => {
      if (onOpenSearch) onOpenSearch();
      else setCmdOpen(true);
    };

    return (
      <>
        <header
          className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-4 md:h-14 md:flex-nowrap md:px-6"
          style={{ borderColor: 'var(--m-hairline)' }}
        >
          {isMobile ? (
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border text-txt-primary hover:bg-white/[0.04]"
              style={{ borderColor: 'var(--m-hairline)' }}
              onClick={onOpenNav}
              aria-label="Open menu"
            >
              ☰
            </button>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2">
              <span className="m-mono-num text-xs font-medium text-txt-muted">Billing period</span>
              <span className="text-sm font-semibold text-txt-primary">May 2026</span>
              <span className="hidden rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-txt-muted sm:inline" style={{ borderColor: 'var(--m-hairline)' }}>{range}</span>
            </div>
            {spendLabel ? (
              <span className="inline-flex items-center gap-2 rounded-control border px-2.5 py-1 text-xs" style={{ borderColor: 'var(--m-hairline)' }}>
                <span className="h-1.5 w-1.5 rounded-full bg-good animate-pulse-live" aria-hidden="true" />
                <span className="text-txt-muted">Spend</span>
                <span className="m-mono-num font-semibold text-txt-primary">{spendLabel}</span>
              </span>
            ) : null}
          </div>

          <div className="hidden items-center gap-0.5 md:flex" role="tablist" aria-label="Date range">
            {['24H', '7D', 'MTD', '90D'].map(r => (
              <button
                key={r}
                type="button"
                className={['rounded-control px-2.5 py-1.5 text-xs font-medium', range === r ? 'bg-white/10 text-txt-primary' : 'text-txt-muted'].join(' ')}
                onClick={() => setRange(r)}
                aria-current={range === r}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border text-txt-muted hover:text-txt-primary md:hidden"
            style={{ borderColor: 'var(--m-hairline)' }}
            onClick={openSearch}
            aria-label="Search"
          >
            ⌕
          </button>

          <button
            type="button"
            className="hidden min-h-[36px] max-w-md flex-1 items-center gap-2 rounded-control border px-3 py-1.5 text-left text-sm text-txt-muted md:flex lg:max-w-sm"
            style={{ borderColor: 'var(--m-hairline)' }}
            onClick={() => setCmdOpen(true)}
          >
            <span>Search…</span>
            <kbd className="ml-auto hidden rounded border px-1.5 text-[10px] font-mono opacity-60 lg:inline" style={{ borderColor: 'var(--m-hairline)' }}>⌘K</kbd>
          </button>

          <div className="relative hidden sm:block">
            <button
              type="button"
              className="m-btn-ghost min-w-[120px] justify-between !py-2 text-xs"
              onClick={() => setModelOpen(o => !o)}
              aria-expanded={modelOpen}
            >
              {modelLabel}
              <span className="text-txt-muted">▾</span>
            </button>
            {modelOpen ? (
              <div
                className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-control border bg-surface-elevated py-1 shadow-popover"
                style={{ borderColor: 'var(--m-hairline)' }}
              >
                {models.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex w-full px-3 py-2 text-left text-xs hover:bg-[#1C2130]"
                    onClick={() => { onModelFilter && onModelFilter(m.id); setModelOpen(false); }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {demo && StatusPill ? <span className="hidden lg:inline-flex"><StatusPill tone="info">Preview data</StatusPill></span> : null}
        </header>

        {/* Mobile date range — second row */}
        <div className="flex gap-1 border-b px-3 py-2 md:hidden" style={{ borderColor: 'var(--m-hairline)' }} role="tablist" aria-label="Date range">
          {['24H', '7D', 'MTD', '90D'].map(r => (
            <button
              key={r}
              type="button"
              className={['flex-1 rounded-control py-2 text-center text-xs font-medium', range === r ? 'bg-white/10 text-txt-primary' : 'text-txt-muted'].join(' ')}
              onClick={() => setRange(r)}
              aria-current={range === r}
            >
              {r}
            </button>
          ))}
        </div>

        <CommandPalette
          setPage={setPage}
          setKeysFilter={setKeysFilter}
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
        />
      </>
    );
  }

  function DashboardShell({ children, page, setPage, setKeysFilter, user, collapsed, onToggle, sideWidth, demo, spendLabel, modelFilter, onModelFilter }) {
    const isMobile = useIsMobile(768);
    const [navOpen, setNavOpen] = React.useState(false);

    const navigate = React.useCallback((p) => {
      setPage(p);
      setNavOpen(false);
    }, [setPage]);

    React.useEffect(() => {
      setNavOpen(false);
    }, [page]);

    React.useEffect(() => {
      if (!isMobile) return;
      document.body.style.overflow = navOpen ? 'hidden' : '';
      return () => { document.body.style.overflow = ''; };
    }, [navOpen, isMobile]);

    return (
      <div className="flex min-h-screen min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-base" data-theme="dark">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[300] focus:rounded-control focus:bg-accent focus:px-3 focus:py-2">
          Skip to main content
        </a>

        {isMobile && navOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        <DashboardSidebar
          page={page}
          setPage={navigate}
          user={user}
          collapsed={isMobile ? false : collapsed}
          onToggle={isMobile ? () => setNavOpen(false) : onToggle}
          sideWidth={sideWidth}
          isMobile={isMobile}
          navOpen={navOpen}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col w-full">
          <DashboardTopBar
            setPage={navigate}
            setKeysFilter={setKeysFilter}
            demo={demo}
            isMobile={isMobile}
            onOpenNav={() => setNavOpen(true)}
            spendLabel={spendLabel}
            modelFilter={modelFilter}
            onModelFilter={onModelFilter}
          />
          <div
            className="main-scroll flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain m-page-enter pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
            id="main-content"
            tabIndex="-1"
          >
            {children}
          </div>
        </div>

        {isMobile ? (
          <MobileBottomNav
            page={page}
            onNavigate={navigate}
            onMenu={() => setNavOpen(true)}
          />
        ) : null}
      </div>
    );
  }

  window.DashboardShell = DashboardShell;
  window.DashboardTopBar = DashboardTopBar;
  window.DashboardSidebar = DashboardSidebar;
  window.MeridianLayout = { useIsMobile };
})();

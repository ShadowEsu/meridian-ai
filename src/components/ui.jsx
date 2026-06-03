// Reusable UI primitives — Tailwind + design tokens.

(function () {
  const { CountUp } = window.MeridianMotion || {};

  function Skeleton({ className, lines }) {
    if (lines) {
      return (
        <div className={['flex flex-col gap-2', className].filter(Boolean).join(' ')}>
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-white/[0.06] bg-[length:200%_100%] animate-shimmer" style={{ width: i === lines - 1 ? '70%' : '100%' }} />
          ))}
        </div>
      );
    }
    return <div className={['rounded bg-white/[0.06] bg-[length:200%_100%] animate-shimmer', className || 'h-20'].join(' ')} />;
  }

  function StatusPill({ tone, icon, children }) {
    const tones = {
      good: 'bg-good/10 text-good border-good/25',
      spend: 'bg-spend/10 text-spend border-spend/25',
      critical: 'bg-critical/10 text-critical border-critical/25',
      info: 'bg-info/10 text-info border-info/25',
      muted: 'bg-white/[0.04] text-txt-muted border-white/[0.08]',
    };
    return (
      <span className={['inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-xs font-medium', tones[tone] || tones.muted].join(' ')}>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    );
  }

  function Toggle({ on, onChange, label, disabled }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange && onChange(!on)}
        className={[
          'relative h-5 w-9 rounded-full border transition-colors duration-150',
          on ? 'border-accent/40 bg-accent/20' : 'border-white/10 bg-white/[0.06]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-4 w-4 rounded-full bg-txt-primary shadow transition-transform duration-200 ease-meridian',
            on ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    );
  }

  function PageBody({ children, className }) {
    return (
      <div className={['m-page mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6', className].filter(Boolean).join(' ')}>
        {children}
      </div>
    );
  }

  function KpiCard({ label, value, format, delta, deltaLabel, deltaPct, deltaUp, tone, loading, hero, sub, spark }) {
    const Spark = window.Sparkline;
    if (loading) {
      return (
        <div className={['m-card m-card-hover p-5 col-span-12 sm:col-span-6 lg:col-span-3', hero ? 'lg:col-span-3' : ''].filter(Boolean).join(' ')}>
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-10 w-40 mb-2" />
          <Skeleton className="h-8 w-full mt-3" />
        </div>
      );
    }
    const toneClass = tone === 'accent' ? 'text-accent' : tone === 'cyan' ? 'text-cyan' : tone === 'spend' ? 'text-spend' : 'text-txt-primary';
    const sparkColor = tone === 'cyan' ? '#22D3EE' : '#6366F1';
    return (
      <article className="m-card m-card-hover col-span-12 flex flex-col gap-2 p-5 sm:col-span-6 lg:col-span-3">
        <div className="flex items-start justify-between gap-2">
          <p className="m-label">{label}</p>
          {deltaPct != null ? (
            <span className={['m-mono-num rounded px-1.5 py-0.5 text-[10px] font-semibold', deltaUp ? 'bg-good/15 text-good' : 'bg-critical/15 text-critical'].join(' ')}>
              {deltaUp ? '↑' : '↓'} {Math.abs(deltaPct)}%
            </span>
          ) : null}
        </div>
        <p className={['m-mono-num font-semibold tracking-tight', hero ? 'text-display' : 'text-2xl', toneClass].join(' ')}>
          {CountUp ? <CountUp value={typeof value === 'number' ? value : 0} format={format || (v => String(v))} /> : (format ? format(value) : value)}
        </p>
        {spark && Spark ? (
          <div className="mt-1 opacity-90">
            <Spark data={spark} color={sparkColor} width={120} height={28} fill />
          </div>
        ) : null}
        {sub ? <p className="text-xs text-txt-muted">{sub}</p> : null}
        {delta != null || deltaLabel ? (
          <p className="flex items-center gap-2 text-xs text-txt-secondary">
            {delta != null ? (
              <StatusPill tone={delta >= 0 ? 'good' : 'critical'}>
                {delta >= 0 ? '↑' : '↓'} {typeof delta === 'number' && format ? format(Math.abs(delta)) : delta}
              </StatusPill>
            ) : null}
            {deltaLabel ? <span>{deltaLabel}</span> : null}
          </p>
        ) : null}
      </article>
    );
  }

  function TabGroup({ tabs, value, onChange }) {
    const ref = React.useRef(null);
    const [underline, setUnderline] = React.useState({ left: 0, width: 0 });
    React.useEffect(() => {
      const root = ref.current;
      if (!root) return;
      const btn = root.querySelector('[aria-selected="true"]');
      if (!btn) return;
      const pr = root.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      setUnderline({ left: br.left - pr.left, width: br.width });
    }, [value, tabs]);
    return (
      <div ref={ref} className="relative inline-flex gap-0.5 rounded-control border p-0.5" style={{ borderColor: 'var(--m-hairline)' }} role="tablist">
        <span className="m-tab-underline pointer-events-none" style={{ left: underline.left, width: underline.width }} aria-hidden="true" />
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            className={['relative z-[1] rounded-control px-3 py-1.5 text-xs font-medium transition-colors', value === t.id ? 'text-txt-primary' : 'text-txt-muted hover:text-txt-secondary'].join(' ')}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  function EfficiencyBar({ score }) {
    const pct = Math.min(100, Math.max(0, score));
    const color = pct >= 75 ? '#22C55E' : pct >= 50 ? '#6366F1' : '#F59E0B';
    return (
      <div className="flex items-center gap-2 min-w-[100px]">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1C2130]">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: pct + '%', backgroundColor: color }} />
        </div>
        <span className="m-mono-num w-8 text-right text-xs text-txt-secondary">{pct}</span>
      </div>
    );
  }

  function ModelTable({ rows, fmtMoney, fmtNum, onRowAction }) {
    const [sort, setSort] = React.useState({ key: 'cost', dir: -1 });
    const [expanded, setExpanded] = React.useState(null);
    const cols = [
      { key: 'name', label: 'Model' },
      { key: 'provider', label: 'Provider' },
      { key: 'requests', label: 'Requests', align: 'right', mono: true },
      { key: 'inTok', label: 'Input tokens', align: 'right', mono: true },
      { key: 'outTok', label: 'Output tokens', align: 'right', mono: true },
      { key: 'cost', label: 'Cost', align: 'right', mono: true },
      { key: 'latency', label: 'Avg latency', align: 'right', mono: true },
      { key: 'efficiency', label: 'Efficiency', align: 'right' },
    ];
    const sorted = [...rows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string') return sort.dir * av.localeCompare(bv);
      return sort.dir * ((av || 0) - (bv || 0));
    });
    function toggleSort(key) {
      setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 });
    }
    if (!rows.length) {
      return <EmptyState title="No model usage yet" description="Connect a provider key to see per-model breakdown." ctaLabel="Add API key" onCta={() => onRowAction && onRowAction('keys')} />;
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b text-label font-semibold uppercase text-txt-muted" style={{ borderColor: 'var(--m-hairline)' }}>
              <th className="w-8 px-4 py-3" scope="col" />
              {cols.map(c => (
                <th key={c.key} className={['cursor-pointer whitespace-nowrap px-4 py-3 hover:text-txt-secondary', c.align === 'right' ? 'text-right' : ''].join(' ')} onClick={() => toggleSort(c.key)} scope="col">
                  {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const open = expanded === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr
                    className="border-b cursor-pointer transition-colors duration-100 hover:bg-[#1C2130]"
                    style={{ borderColor: 'var(--m-hairline)' }}
                    onClick={() => setExpanded(open ? null : row.id)}
                  >
                    <td className="px-4 py-3 text-txt-muted">{open ? '▾' : '▸'}</td>
                    <td className="px-4 py-3 font-medium text-txt-primary">{row.name}</td>
                    <td className="px-4 py-3 capitalize text-txt-secondary">{row.provider}</td>
                    <td className="m-mono-num px-4 py-3 text-right">{fmtNum(row.requests)}</td>
                    <td className="m-mono-num px-4 py-3 text-right text-txt-secondary">{fmtNum(row.inTok)}</td>
                    <td className="m-mono-num px-4 py-3 text-right text-txt-secondary">{fmtNum(row.outTok)}</td>
                    <td className="m-mono-num px-4 py-3 text-right font-medium">{fmtMoney(row.cost)}</td>
                    <td className="m-mono-num px-4 py-3 text-right text-txt-secondary">{row.latency}ms</td>
                    <td className="px-4 py-3"><EfficiencyBar score={row.efficiency} /></td>
                  </tr>
                  {open ? (
                    <tr className="border-b bg-[#0E1117]" style={{ borderColor: 'var(--m-hairline)' }}>
                      <td colSpan={9} className="px-6 py-4">
                        <div className="m-stagger grid gap-2 sm:grid-cols-2">
                          {(row.endpoints || []).map(ep => (
                            <div key={ep.path} className="flex justify-between rounded-control border px-3 py-2 text-xs" style={{ borderColor: 'var(--m-hairline)' }}>
                              <span className="m-mono-num text-txt-secondary">{ep.path}</span>
                              <span className="m-mono-num text-txt-primary">{fmtMoney(ep.cost)} · {fmtNum(ep.requests)} req</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function AnomalyFeed({ items, fmtMoney, onInvestigate }) {
    if (!items || !items.length) {
      return <p className="px-4 py-8 text-center text-sm text-txt-muted">No anomalies detected</p>;
    }
    return (
      <ol className="relative flex flex-col gap-0 py-2">
        <span className="absolute left-[19px] top-3 bottom-3 w-px bg-[#1C2130]" aria-hidden="true" />
        {items.map((a, i) => (
          <li
            key={a.id}
            className="animate-slide-in-right relative flex gap-3 px-4 py-3 transition-colors hover:bg-[#1C2130]/60"
            style={{ animationDelay: (i * 60) + 'ms' }}
          >
            <span
              className={['relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-critical shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-spend'].join(' ')}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-txt-primary">{a.model}</span>
                <span className="m-mono-num shrink-0 text-sm font-semibold text-critical">+{fmtMoney(a.amount)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-txt-muted">{a.time}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-txt-secondary">{a.explain}</p>
              <button type="button" className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => onInvestigate && onInvestigate(a)}>
                Investigate →
              </button>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  function EmptyState({ title, description, ctaLabel, onCta, icon }) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border text-xl text-txt-muted" style={{ borderColor: 'var(--m-hairline)' }} aria-hidden="true">
          {icon || '◇'}
        </div>
        <h3 className="text-base font-semibold text-txt-primary">{title}</h3>
        <p className="max-w-sm text-sm text-txt-secondary">{description}</p>
        {ctaLabel ? <button type="button" className="m-btn-primary mt-1" onClick={onCta}>{ctaLabel}</button> : null}
      </div>
    );
  }

  function ChartCard({ title, subtitle, action, children, loading, className, span }) {
    const col = span || 'col-span-12 lg:col-span-7';
    return (
      <article className={['m-card flex flex-col', col, className].filter(Boolean).join(' ')}>
        <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-5 sm:py-4" style={{ borderColor: 'var(--m-hairline)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-txt-primary sm:text-title-2">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-txt-secondary sm:text-sm">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
        <div className="p-4 sm:p-5">
          {loading ? <Skeleton className="h-[200px] w-full" /> : children}
        </div>
      </article>
    );
  }

  function DataTable({ columns, rows, onRowClick, empty }) {
    const [stacked, setStacked] = React.useState(false);
    React.useEffect(() => {
      const mq = window.matchMedia('(max-width: 639px)');
      const fn = () => setStacked(mq.matches);
      fn();
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    }, []);

    if (!rows || !rows.length) {
      return <div className="py-12 text-center text-sm text-txt-muted">{empty || 'No data'}</div>;
    }

    if (stacked) {
      return (
        <ul className="divide-y" style={{ borderColor: 'var(--m-hairline)' }}>
          {rows.map((row, i) => (
            <li
              key={row.id || i}
              className="cursor-pointer px-4 py-3 transition-colors active:bg-white/[0.04]"
              onClick={() => onRowClick && onRowClick(row)}
            >
              {columns.map(c => (
                <div key={c.key} className="flex items-start justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-txt-muted">{c.label}</span>
                  <span className={['min-w-0 text-right text-sm', c.mono ? 'm-mono-num font-medium text-txt-primary' : 'text-txt-secondary'].join(' ')}>
                    {c.render ? c.render(row) : row[c.key]}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div className="-mx-4 overflow-x-auto overscroll-x-contain sm:mx-0">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b text-label font-semibold uppercase text-txt-muted" style={{ borderColor: 'var(--m-hairline)' }}>
              {columns.map(c => (
                <th key={c.key} className={['whitespace-nowrap px-4 py-3 font-semibold sm:px-5', c.align === 'right' ? 'text-right' : ''].join(' ')} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id || i}
                className="border-b transition-colors duration-100 hover:bg-white/[0.03] cursor-pointer"
                style={{ borderColor: 'var(--m-hairline)' }}
                onClick={() => onRowClick && onRowClick(row)}
              >
                {columns.map(c => (
                  <td
                    key={c.key}
                    className={[
                      'px-4 py-3 sm:px-5',
                      c.mono ? 'm-mono-num font-medium whitespace-nowrap' : 'text-txt-secondary',
                      c.align === 'right' ? 'text-right' : '',
                    ].join(' ')}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function PageHeader({ title, breadcrumb, actions }) {
    return (
      <header className="border-b pb-4" style={{ borderColor: 'var(--m-hairline)' }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {breadcrumb ? (
              <nav className="mb-1 truncate text-xs text-txt-muted" aria-label="Breadcrumb">
                {breadcrumb}
              </nav>
            ) : null}
            <h1 className="text-lg font-semibold tracking-tight text-txt-primary sm:text-title-1">{title}</h1>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>
    );
  }

  function ListPanel({ title, subtitle, items, loading }) {
    return (
      <article className="m-card col-span-12 flex flex-col lg:col-span-5">
        <header className="border-b px-5 py-4" style={{ borderColor: 'var(--m-hairline)' }}>
          <h3 className="text-title-2 font-semibold">{title}</h3>
          {subtitle ? <p className="text-sm text-txt-secondary">{subtitle}</p> : null}
        </header>
        <ul className="divide-y" style={{ borderColor: 'var(--m-hairline)' }}>
          {loading ? (
            <li className="p-5"><Skeleton lines={4} /></li>
          ) : items.map(it => (
            <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-txt-primary">{it.title}</p>
                {it.sub ? <p className="text-xs text-txt-muted">{it.sub}</p> : null}
              </div>
              <span className="m-mono-num shrink-0 text-sm font-medium text-accent">{it.value}</span>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  window.MeridianUIComponents = {
    PageBody,
    Skeleton,
    StatusPill,
    Toggle,
    KpiCard,
    ChartCard,
    DataTable,
    PageHeader,
    ListPanel,
    TabGroup,
    ModelTable,
    AnomalyFeed,
    EmptyState,
    EfficiencyBar,
  };
})();

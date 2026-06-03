// Production pages for the new sidebar destinations:
// Teams (live CRUD), Routing rules, Cache, Billing, Integrations, Settings.
// PageHead is shared from models.jsx.

/* ============================================================
 * TEAMS — CRUD on /api/teams
 * ============================================================ */
function PageTeams() {
  const M = window.MERIDIAN;
  const [show, setShow] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', monthlyBudgetUsd: '' });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const { items, error: listError, refresh } = window.MeridianAPI.useList(
    () => window.MeridianAPI.teams.list(),
    { teams: M.TEAMS || [] }
  );
  const teams = items ? (items.teams || items) : [];

  async function createTeam() {
    setBusy(true); setErr(null);
    try {
      const payload = {
        name: form.name,
        monthlyBudgetUsd: form.monthlyBudgetUsd ? Number(form.monthlyBudgetUsd) : null,
      };
      if (!window.MeridianAPI.live) {
        M.TEAMS.push({ id: 't_' + Date.now(), name: payload.name, members: 0, budget: payload.monthlyBudgetUsd || 0, spend: 0 });
      } else {
        await window.MeridianAPI.teams.create(payload);
      }
      refresh();
      setShow(false);
      setForm({ name: '', monthlyBudgetUsd: '' });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function deleteTeam(id) {
    if (!window.MeridianAPI.live) {
      const i = M.TEAMS.findIndex(t => (t.id || t.name) === id);
      if (i >= 0) M.TEAMS.splice(i, 1);
      refresh(); return;
    }
    try { await window.MeridianAPI.teams.delete(id); refresh(); } catch (e) { console.error(e); }
  }

  const totalSpend  = teams.reduce((s, t) => s + (t.spend || t.spentUsd || 0), 0);
  const totalBudget = teams.reduce((s, t) => s + (t.budget || t.monthlyBudgetUsd || 0), 0);

  return (
    <div className="overview-r">
      <PageHead title="Teams" eyebrow="Workspace" right={
        <>
          <span className="chip">{teams.length} teams · ${(totalSpend/1000).toFixed(1)}k of ${(totalBudget/1000).toFixed(0)}k</span>
          <button type="button" className="cta-r" onClick={() => setShow(true)}>+ New team</button>
        </>
      } />

      {listError && (
        <div className="card-r" style={{ padding: '12px 16px', color: 'var(--red)', borderColor: 'rgba(239,86,72,.3)', marginBottom: 12 }}>
          {listError.message}
        </div>
      )}

      <article className="card-r" style={{ padding: 0 }}>
        <header className="card-head">
          <div className="l">
            <h3>All teams</h3>
            <span className="sub">click a row to edit · cap = monthly USD budget</span>
          </div>
          <div className="r">
            <button type="button" className="ghost-r" onClick={refresh}>Refresh</button>
          </div>
        </header>
        <div style={{ padding: 16, display: 'grid', gap: 8 }}>
          {teams.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-mute)' }}>
              No teams yet. <button className="ghost-r" style={{ display: 'inline-flex' }} onClick={() => setShow(true)}>Create one →</button>
            </div>
          ) : teams.map(t => {
            const spend = t.spend || t.spentUsd || 0;
            const budget = t.budget || t.monthlyBudgetUsd || 1;
            const pct = (spend / budget) * 100;
            const over = pct > 100;
            return (
              <div
                key={t.id || t.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr 100px auto',
                  gap: 16, alignItems: 'center',
                  padding: 14, border: '1px solid var(--line)', borderRadius: 10,
                  background: 'var(--surface-2)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>{t.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', marginTop: 3 }}>
                    {t.members ? `${t.members} members` : 'no members'}
                  </div>
                </div>
                <div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', inset: 0,
                      width: Math.min(100, pct) + '%',
                      background: over ? 'var(--grad-hot)' : 'linear-gradient(90deg, var(--good), var(--oa-2))',
                      boxShadow: over ? '0 0 8px var(--red)' : '0 0 8px var(--good)',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)' }}>
                    <span>${(spend).toLocaleString()} of ${(budget).toLocaleString()}</span>
                    <span style={{ color: over ? 'var(--red)' : 'var(--text-dim)', fontWeight: 500 }}>{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mute)', textAlign: 'right' }}>
                  {t.calls || '—'}
                </div>
                <div>
                  <button
                    type="button"
                    className="ghost-r"
                    onClick={() => deleteTeam(t.id || t.name)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </article>

      {show && (
        <div className="modal-backdrop" onClick={() => setShow(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', margin: 0, fontWeight: 600 }}>New team</h3>
            <p style={{ color: 'var(--text-mute)', fontSize: 13, marginTop: 4 }}>
              Track spend and set a monthly cap.
            </p>
            <div className="field">
              <label>Team name</label>
              <input className="input" placeholder="e.g. Engineering" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Monthly budget (USD)</label>
              <input className="input" type="number" placeholder="e.g. 30000" value={form.monthlyBudgetUsd}
                onChange={e => setForm(f => ({ ...f, monthlyBudgetUsd: e.target.value }))} />
            </div>
            {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="ghost-r" onClick={() => { setShow(false); setErr(null); }}>Cancel</button>
              <button type="button" className="cta-r" onClick={createTeam} disabled={busy || !form.name}>
                {busy ? 'Creating…' : 'Create'} <span className="arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * ROUTING RULES — viewer for default routing + custom rules placeholder
 * ============================================================ */
function PageRoutingRules() {
  const M = window.MERIDIAN;
  const UI = window.MeridianUI;
  const rules = (M.ROUTING_RULES || [
    { id: 'r1', when: 'task = code-completion', route: 'gpt-4.1-mini', why: 'cheapest with code training' },
    { id: 'r2', when: 'tokens > 50k', route: 'claude-sonnet-4-6', why: '200k context, 5× cheaper than opus' },
    { id: 'r3', when: 'team = support', route: 'claude-haiku-4-5', why: 'sub-300ms latency, fixed prompts' },
    { id: 'r4', when: 'team = research, longCtx', route: 'gemini-2.5-pro', why: '2M context window' },
    { id: 'r5', when: '*', route: 'gpt-4.1', why: 'default fallback' },
  ]);

  return (
    <div className="overview-r">
      <PageHead title="Smart router" eyebrow="Workspace · ML policy" right={
        <>
          <span className="chip"><span className="dot"></span>policy v3.2 · live</span>
          <button type="button" className="cta-r" onClick={() => UI && UI.comingSoon('Custom routing rules')}>+ New rule</button>
        </>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <article className="card-r" style={{ padding: 0 }}>
          <header className="card-head">
            <div className="l">
              <h3>Active rules</h3>
              <span className="sub">evaluated top → bottom · first match wins</span>
            </div>
            <div className="r">
              <span className="chip">{rules.length} rules</span>
            </div>
          </header>
          <div style={{ padding: '12px 0' }}>
            {rules.map((r, i) => (
              <div key={r.id} style={{
                display: 'grid', gridTemplateColumns: '32px 1fr 1fr auto', gap: 14,
                padding: '12px 22px', alignItems: 'center',
                borderBottom: i < rules.length - 1 ? '1px solid var(--line)' : 'none',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{i + 1}</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                    when {r.when}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 3 }}>
                    {r.why}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)' }}>→</span>
                  <span className="chip" style={{ fontFamily: 'var(--font-mono)' }}>{r.route}</span>
                </div>
                <button type="button" className="ghost-r" onClick={() => UI && UI.comingSoon('Rule editor')}>Edit</button>
              </div>
            ))}
          </div>
        </article>

        <article className="card-r" style={{ padding: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>
            How smart-routing decides
          </div>
          <h3 style={{ margin: '8px 0 16px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>
            Cheapest model that meets quality.
          </h3>
          <div style={{ display: 'grid', gap: 10, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <div><b style={{ color: 'var(--text)' }}>1. Match rules</b> — first-match wins, evaluated top to bottom.</div>
            <div><b style={{ color: 'var(--text)' }}>2. Check budget</b> — if the matched team is at cap, fall back to the next-cheapest model that still passes quality.</div>
            <div><b style={{ color: 'var(--text)' }}>3. Cache lookup</b> — exact-prompt cache hit returns immediately, $0.00 cost. 38% hit rate currently.</div>
            <div><b style={{ color: 'var(--text)' }}>4. Provider failover</b> — if primary returns 5xx or rate-limits, retry with next-cheapest in the same quality tier.</div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div className="chip"><span className="dot"></span>saving $14,200 / mo via smart-route</div>
          </div>
        </article>
      </div>
    </div>
  );
}

/* ============================================================
 * CACHE — stats + config view
 * ============================================================ */
function PageCache() {
  const stats = [
    { k: 'Hit rate', v: '38.2%', sub: 'last 30 days', good: true },
    { k: 'Saved', v: '$4,128', sub: 'this month' },
    { k: 'Hits / hr', v: '2,418', sub: 'avg over 24h' },
    { k: 'Storage', v: '142 MB', sub: '64k entries · LRU' },
  ];
  const top = [
    { prompt: 'Summarize this email in 2 sentences', hits: 8420, model: 'gpt-4.1-mini', saved: 312 },
    { prompt: 'Extract the action items from...', hits: 5210, model: 'claude-haiku-4-5', saved: 184 },
    { prompt: 'Classify support ticket priority', hits: 4880, model: 'claude-haiku-4-5', saved: 142 },
    { prompt: 'Translate the following to Spanish', hits: 3120, model: 'gpt-4.1-nano', saved: 88 },
    { prompt: 'Generate alt text for image', hits: 2840, model: 'gemini-2.5-flash', saved: 64 },
  ];

  return (
    <div className="overview-r">
      <PageHead title="Cache" eyebrow="Workspace" right={
        <span className="chip"><span className="dot"></span>healthy · last evict 4m ago</span>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        {stats.map(s => (
          <div key={s.k} className="card-r" style={{ padding: 18 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>
              {s.k}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8, color: s.good ? 'var(--good)' : 'var(--text)' }}>
              {s.v}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      <article className="card-r" style={{ padding: 0 }}>
        <header className="card-head">
          <div className="l">
            <h3>Top cached prompts</h3>
            <span className="sub">deduplicated by exact match · last 30 days</span>
          </div>
          <div className="r"><span className="chip">5 of {top.length} shown</span></div>
        </header>
        <table className="models-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 22 }}>Prompt</th>
              <th>Model served</th>
              <th style={{ textAlign: 'right' }}>Hits</th>
              <th style={{ textAlign: 'right', paddingRight: 22 }}>Saved</th>
            </tr>
          </thead>
          <tbody>
            {top.map(r => (
              <tr key={r.prompt}>
                <td style={{ paddingLeft: 22, color: 'var(--text)' }}>"{r.prompt}…"</td>
                <td className="mono-cell">{r.model}</td>
                <td className="mono-cell" style={{ textAlign: 'right' }}>{r.hits.toLocaleString()}</td>
                <td className="mono-cell" style={{ textAlign: 'right', paddingRight: 22, color: 'var(--good)' }}>${r.saved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
}

/* ============================================================
 * BILLING — invoice list + plan card
 * ============================================================ */
function PageBilling() {
  const invoices = [
    { id: 'inv_2026_05', period: 'May 2026', amount: 932.40, status: 'open',  due: '2026-06-01' },
    { id: 'inv_2026_04', period: 'April 2026', amount: 884.20, status: 'paid', due: '2026-05-01' },
    { id: 'inv_2026_03', period: 'March 2026', amount: 791.80, status: 'paid', due: '2026-04-01' },
    { id: 'inv_2026_02', period: 'February 2026', amount: 612.10, status: 'paid', due: '2026-03-01' },
    { id: 'inv_2026_01', period: 'January 2026', amount: 488.50, status: 'paid', due: '2026-02-01' },
  ];

  return (
    <div className="overview-r">
      <PageHead title="Billing" eyebrow="Operations" right={
        <span className="chip">team plan · $0.05 / 1k metered</span>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <article className="card-r" style={{ padding: 0 }}>
          <header className="card-head">
            <div className="l">
              <h3>Invoices</h3>
              <span className="sub">stripe-backed · auto-billed monthly</span>
            </div>
            <div className="r">
              <button type="button" className="ghost-r" onClick={() => window.MeridianUI && window.MeridianUI.exportData('Invoices')}>Download all</button>
            </div>
          </header>
          <table className="models-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Period</th>
                <th>Invoice ID</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Due</th>
                <th style={{ textAlign: 'right', paddingRight: 22 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ paddingLeft: 22 }}>{inv.period}</td>
                  <td className="mono-cell">{inv.id}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>${inv.amount.toFixed(2)}</td>
                  <td className="mono-cell">{inv.due}</td>
                  <td style={{ textAlign: 'right', paddingRight: 22 }}>
                    <span className="chip" style={{
                      color: inv.status === 'paid' ? 'var(--good)' : 'var(--amber-2)',
                      borderColor: inv.status === 'paid' ? 'rgba(63,179,127,.25)' : 'rgba(232,160,74,.25)',
                      background: inv.status === 'paid' ? 'rgba(63,179,127,.07)' : 'rgba(232,160,74,.07)',
                    }}>
                      <span className="dot" style={{ background: inv.status === 'paid' ? 'var(--good)' : 'var(--amber-2)' }}></span>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="card-r" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--text-faint)', textTransform: 'uppercase' }}>
              Current plan
            </div>
            <h3 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22 }}>Team</h3>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mute)', marginTop: 4 }}>
              $0.05 / 1k routed tokens · unlimited keys
            </div>
          </div>
          <div style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>This month</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 4 }}>
              $932.40
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>
              18,648,000 routed tokens · invoiced June 1
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
            <button type="button" className="cta-r">Upgrade plan</button>
            <button type="button" className="ghost-r">Payment methods</button>
          </div>
        </article>
      </div>
    </div>
  );
}

/* ============================================================
 * INTEGRATIONS — list of available + connected integrations
 * ============================================================ */
function PageIntegrations() {
  const UI = window.MeridianUI;
  const integrations = [
    { id: 'slack',     name: 'Slack',     blurb: 'Post alerts to a channel', status: 'connected', icon: '◇' },
    { id: 'pagerduty', name: 'PagerDuty', blurb: 'Page on-call for criticals', status: 'connected', icon: '!' },
    { id: 'webhook',   name: 'Webhook',   blurb: 'POST every routed call to your URL', status: 'available' },
    { id: 'datadog',   name: 'Datadog',   blurb: 'Forward metrics + traces', status: 'available' },
    { id: 'segment',   name: 'Segment',   blurb: 'Stream events into your CDP', status: 'available' },
    { id: 'oidc',      name: 'OIDC SSO',  blurb: 'Okta · Azure AD · Google Workspace', status: 'available' },
  ];

  return (
    <div className="overview-r">
      <PageHead title="Integrations" eyebrow="Operations" right={
        <span className="chip">{integrations.filter(i => i.status === 'connected').length} connected · preview</span>
      } />

      <div className="coming-soon-banner card-r">
        <strong>Integrations — coming soon</strong>
        <span>Slack, PagerDuty, webhooks, and SSO connectors are on the roadmap.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {integrations.map(i => {
          const connected = i.status === 'connected';
          return (
            <article key={i.id} className="card-r" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: connected ? 'rgba(63,179,127,0.10)' : 'var(--surface-2)',
                border: '1px solid ' + (connected ? 'rgba(63,179,127,0.25)' : 'var(--line)'),
                display: 'grid', placeItems: 'center',
                fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600,
                color: connected ? 'var(--good)' : 'var(--text-mute)',
              }}>
                {i.icon || i.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{i.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 3 }}>{i.blurb}</div>
              </div>
              <button
                type="button"
                className={connected ? 'ghost-r' : 'cta-r'}
                onClick={() => UI && UI.comingSoon(i.name + ' integration')}
              >
                {connected ? 'Configure' : 'Connect →'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * SETTINGS — local prefs (theme, density, sidebar default)
 * ============================================================ */
function PageSettings() {
  const [prefs, setPrefs] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('meridian_prefs') || '{}'); } catch { return {}; }
  });
  function setPref(k, v) {
    setPrefs(p => {
      const next = { ...p, [k]: v };
      try { localStorage.setItem('meridian_prefs', JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const sections = [
    {
      title: 'Account',
      rows: [
        { label: 'Email',         value: 'aadi@meridian.dev', readOnly: true },
        { label: 'Workspace',     value: 'Acme · production', readOnly: true },
        { label: 'Plan',          value: 'Team',              readOnly: true },
      ],
    },
    {
      title: 'Display',
      rows: [
        { label: 'Sidebar default', kind: 'toggle', value: !!prefs.sidebarCollapsed,
          onChange: v => setPref('sidebarCollapsed', v),
          hint: 'Start with the rail collapsed' },
        { label: 'Theme', kind: 'static', value: 'Dark · refined' },
        { label: 'Density', kind: 'static', value: 'Default · 4 KPIs above the fold' },
      ],
    },
    {
      title: 'Notifications',
      rows: [
        { label: 'Email digest',  kind: 'toggle', value: prefs.emailDigest !== false,
          onChange: v => setPref('emailDigest', v) },
        { label: 'Critical Slack', kind: 'toggle', value: !!prefs.criticalSlack,
          onChange: v => setPref('criticalSlack', v) },
      ],
    },
  ];

  return (
    <div className="overview-r">
      <PageHead title="Settings" eyebrow="Operations" right={
        <span className="chip">prefs saved locally</span>
      } />

      <div style={{ display: 'grid', gap: 14 }}>
        {sections.map(sec => (
          <article key={sec.title} className="card-r" style={{ padding: 0 }}>
            <header className="card-head">
              <div className="l"><h3>{sec.title}</h3></div>
            </header>
            <div style={{ padding: '8px 22px' }}>
              {sec.rows.map(row => (
                <div key={row.label} style={{
                  display: 'grid', gridTemplateColumns: '180px 1fr auto',
                  alignItems: 'center', gap: 16,
                  padding: '14px 0', borderBottom: '1px solid var(--line)',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{row.label}</div>
                    {row.hint ? (
                      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 3 }}>{row.hint}</div>
                    ) : null}
                  </div>
                  <div style={{ fontFamily: row.kind === 'toggle' ? 'var(--font-sans)' : 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-dim)' }}>
                    {row.kind === 'toggle' ? null : (row.value || '—')}
                  </div>
                  <div>
                    {row.kind === 'toggle' ? (
                      <button
                        type="button"
                        className="ghost-r"
                        onClick={() => row.onChange(!row.value)}
                        style={{
                          background: row.value ? 'rgba(63,179,127,0.12)' : 'transparent',
                          color: row.value ? 'var(--good)' : 'var(--text-mute)',
                          borderColor: row.value ? 'rgba(63,179,127,0.30)' : 'var(--line)',
                        }}
                      >
                        {row.value ? 'On' : 'Off'}
                      </button>
                    ) : row.readOnly ? (
                      <span className="chip">read-only</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

window.PageTeams = PageTeams;
window.PageRoutingRules = PageRoutingRules;
window.PageCache = PageCache;
window.PageBilling = PageBilling;
window.PageIntegrations = PageIntegrations;
window.PageSettings = PageSettings;

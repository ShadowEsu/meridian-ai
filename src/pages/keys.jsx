function PageKeys({ keysFilter }) {
  const M = window.MERIDIAN;
  const [filter, setFilter] = React.useState(keysFilter || '');
  const [showCreate, setShowCreate] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({ label: '', monthlyBudgetUsd: '' });
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  // One-time secret modal state — never logged, never persisted
  const [revealed, setRevealed] = React.useState(null); // { secret, prefix }
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => { if (keysFilter) setFilter(keysFilter); }, [keysFilter]);

  const { items: keysData, error: listError, refresh } = window.MeridianAPI.useList(
    () => window.MeridianAPI.virtualKeys.list(),
    { keys: M.VIRTUAL_KEYS || [] }
  );

  // Normalize: API returns { keys: [...] }, demo fallback has same shape or raw array
  const rawKeys = keysData ? (keysData.keys || keysData) : [];

  // Adapt API shape → display shape used by the table
  function adaptKey(k) {
    // Live API shape: { id, prefix, label, monthlyBudgetUsd, spentMtdUsd, status, ... }
    // Demo shape:     { name, team, budget, spend, requests, status, mask }
    if (k.prefix !== undefined) {
      return {
        id: k.id,
        name: k.label || k.prefix,
        team: k.teamId || '—',
        budget: k.monthlyBudgetUsd || 0,
        spend: k.spentMtdUsd || 0,
        requests: '—',
        status: k.status || 'active',
        mask: k.prefix + '…',
      };
    }
    return { id: k.id || k.name, ...k };
  }

  const allKeys = rawKeys.map(adaptKey);
  const filteredKeys = allKeys.filter(k =>
    !filter ||
    String(k.name).toLowerCase().includes(filter.toLowerCase()) ||
    String(k.team).toLowerCase().includes(filter.toLowerCase())
  );

  async function createKey() {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const form = {
        label: createForm.label,
        monthlyBudgetUsd: createForm.monthlyBudgetUsd ? Number(createForm.monthlyBudgetUsd) : null,
      };
      if (!window.MeridianAPI.live) {
        // Demo: append to in-memory list, no secret to show
        M.VIRTUAL_KEYS.push({
          id: Date.now(),
          prefix: 'mk_demo',
          name: form.label || 'mk_demo',
          label: form.label,
          team: '—',
          budget: form.monthlyBudgetUsd || 0,
          spend: 0,
          requests: 0,
          status: 'active',
          mask: 'mk_demo…',
        });
        refresh();
        setShowCreate(false);
        setCreateForm({ label: '', monthlyBudgetUsd: '' });
      } else {
        const r = await window.MeridianAPI.virtualKeys.create(form);
        setRevealed({ secret: r.secret, prefix: r.key.prefix }); // shown once
        refresh();
        setShowCreate(false);
        setCreateForm({ label: '', monthlyBudgetUsd: '' });
      }
    } catch (e) {
      setCreateError(e.message || 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  }

  async function deleteKey(id) {
    if (!window.MeridianAPI.live) {
      const idx = M.VIRTUAL_KEYS.findIndex(k => (k.id || k.name) === id);
      if (idx !== -1) M.VIRTUAL_KEYS.splice(idx, 1);
      refresh();
      return;
    }
    try {
      await window.MeridianAPI.virtualKeys.delete(id);
      refresh();
    } catch (e) {
      // non-blocking: log to console only (not the secret)
      console.error('Delete key failed', e.message);
    }
  }

  function copySecret() {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const velocity = [
    { day: 'Mon', spend: 820, requests: '18.2k', saved: 92, risk: 'Low' },
    { day: 'Tue', spend: 1210, requests: '24.7k', saved: 118, risk: 'Low' },
    { day: 'Wed', spend: 1125, requests: '22.9k', saved: 104, risk: 'Med' },
    { day: 'Thu', spend: 1620, requests: '31.4k', saved: 176, risk: 'Med' },
    { day: 'Fri', spend: 1320, requests: '27.1k', saved: 143, risk: 'Low' },
    { day: 'Sat', spend: 1835, requests: '36.8k', saved: 205, risk: 'High' },
    { day: 'Sun', spend: 1510, requests: '29.6k', saved: 188, risk: 'Med' },
  ];
  const peakSpend = Math.max(...velocity.map(v => v.spend));
  const totalWeeklySpend = velocity.reduce((sum, v) => sum + v.spend, 0);
  const totalWeeklySaved = velocity.reduce((sum, v) => sum + v.saved, 0);
  const latest = velocity[velocity.length - 1];

  const overBudget = filteredKeys.filter(k => (Number(k.spend) || 0) > (Number(k.budget) || Infinity)).length;
  const totalSpend = filteredKeys.reduce((s, k) => s + (Number(k.spend) || 0), 0);

  return (
    <div className="overview-r">
      <PageHead title="API keys" eyebrow="Operations" right={
        <>
          <span className="chip">
            {allKeys.length} keys
            {overBudget > 0 ? <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {overBudget} over</span> : null}
            {filter ? ` · "${filter}"` : ''}
          </span>
          <button type="button" className="cta-r" onClick={() => setShowCreate(true)}>+ New key</button>
        </>
      } />

      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <div className="card-r" style={{ padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Total spend MTD
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8 }}>
            ${totalSpend.toLocaleString()}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
            across {allKeys.length} keys
          </div>
        </div>
        <div className="card-r" style={{ padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Est. savings
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8, color: 'var(--good)' }}>
            +$2,840
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
            via smart-route
          </div>
        </div>
        <div className="card-r" style={{ padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Healthy
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8 }}>
            {allKeys.length - overBudget}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--good)', marginTop: 6 }}>
            within budget
          </div>
        </div>
        <div className="card-r" style={{ padding: 18, borderColor: overBudget > 0 ? 'rgba(239,86,72,.30)' : undefined }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: overBudget > 0 ? 'var(--red)' : 'var(--text-faint)' }}>
            Over budget
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8, color: overBudget > 0 ? 'var(--red)' : 'var(--text)' }}>
            {overBudget}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
            keys at risk
          </div>
        </div>
      </div>

      {/* Keys table */}
      <article className="card-r" style={{ padding: 0, overflow: 'hidden' }}>
        <header className="card-head">
          <div className="l">
            <h3>Virtual keys</h3>
            <span className="sub">{filteredKeys.length} of {allKeys.length} shown</span>
          </div>
          <div className="r">
            <input
              className="input"
              placeholder="Filter…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ height: 30, fontSize: 12, padding: '0 10px', width: 160 }}
            />
            <button type="button" className="ghost-r">Export</button>
          </div>
        </header>

        {listError && (
          <div style={{ padding: '10px 16px', background: 'rgba(239,86,72,.10)', color: 'var(--red)', fontSize: 13, borderBottom: '1px solid rgba(239,86,72,.2)' }}>
            Failed to load keys: {listError.message}
          </div>
        )}

        <table className="models-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 22 }}>Key</th>
              <th>Team</th>
              <th style={{ textAlign: 'right' }}>Spend MTD</th>
              <th>Budget</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'right', paddingRight: 22 }}></th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: 36, textAlign: 'center', color: 'var(--text-mute)' }}>
                {filter ? 'No matching keys.' : 'No keys yet — create one above.'}
              </td></tr>
            ) : filteredKeys.slice(0, 12).map(k => {
              const budget = Number(k.budget) || 1;
              const spend = Number(k.spend) || 0;
              const pct = budget > 0 ? (spend / budget) * 100 : 0;
              const over = pct > 100;
              const warn = pct > 90 && !over;
              const barColor = over ? 'var(--red)' : warn ? 'var(--amber)' : 'var(--good)';
              return (
                <tr key={k.id || k.name}>
                  <td style={{ paddingLeft: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: 'var(--indigo-2)' }}>{Icon.key({ width: 14, height: 14 })}</span>
                      <span style={{ fontWeight: 500 }}>{k.name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-mute)' }}>{k.team}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>${spend.toLocaleString()}</td>
                  <td>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ height: '100%', width: Math.min(100, pct) + '%', background: barColor, boxShadow: `0 0 6px ${barColor}` }} />
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: over ? 'var(--red)' : warn ? 'var(--amber-2)' : 'var(--text-mute)' }}>
                      {pct.toFixed(0)}% of ${budget.toLocaleString()}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="chip" style={{
                      color: over ? 'var(--red)' : warn ? 'var(--amber-2)' : 'var(--good)',
                      borderColor: over ? 'rgba(239,86,72,.30)' : warn ? 'rgba(232,160,74,.30)' : 'rgba(63,179,127,.25)',
                      background: over ? 'rgba(239,86,72,.10)' : warn ? 'rgba(232,160,74,.07)' : 'rgba(63,179,127,.07)',
                    }}>
                      <span className="dot" style={{ background: over ? 'var(--red)' : warn ? 'var(--amber-2)' : 'var(--good)' }}></span>
                      {over ? 'over' : warn ? 'at risk' : 'active'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 22 }}>
                    <button
                      type="button"
                      className="ghost-r"
                      onClick={() => deleteKey(k.id || k.name)}
                      style={{ color: 'var(--red)' }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="ex-foot">
          <span>Showing {Math.min(12, filteredKeys.length)} of {allKeys.length}</span>
          <span style={{ color: 'var(--text-mute)' }}>Keys are bcrypt-hashed; only prefixes are shown.</span>
        </div>
      </article>

      {/* Create Key Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create virtual key</h3>
            <p className="sub">A new key will be generated. The full secret is shown once.</p>
            <div className="field">
              <label>Label</label>
              <input
                className="input"
                placeholder="e.g. eng-prod-main"
                value={createForm.label}
                onChange={e => setCreateForm(f => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Monthly budget (USD, optional)</label>
              <input
                className="input"
                type="number"
                placeholder="e.g. 1000"
                value={createForm.monthlyBudgetUsd}
                onChange={e => setCreateForm(f => ({ ...f, monthlyBudgetUsd: e.target.value }))}
              />
            </div>
            {createError && (
              <div style={{ color: '#FCA5A5', fontSize: 13, marginBottom: 8 }}>{createError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setCreateError(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={createKey} disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-time secret modal */}
      {revealed && (
        <div className="modal-backdrop" onClick={() => setRevealed(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Key created: {revealed.prefix}…</h3>
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#FCA5A5', marginBottom: 6 }}>
                This is the only time this secret will be shown. Copy it now.
              </div>
              <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all', color: '#fff', userSelect: 'all' }}>
                {revealed.secret}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={copySecret}>
                {copied ? 'Copied!' : 'Copy secret'}
              </button>
              <button className="btn btn-ghost" onClick={() => setRevealed(null)}>I've saved it, close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const tabBtn = {
  background: 'transparent',
  border: '0',
  padding: '6px 4px',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.45)',
};

const tabBtnActive = {
  ...tabBtn,
  color: '#fff',
  borderBottom: '2px solid #6366F1',
};

const th = { padding: '12px 16px', textAlign: 'left', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', fontWeight: 700, whiteSpace: 'nowrap' };
const td = { padding: '12px 16px', whiteSpace: 'nowrap' };

function RiskRow({ label, value, tone }) {
  const map = { red: ['var(--red)', 'rgba(239,68,68,.10)'], amber: ['var(--amber)', 'rgba(245,158,11,.10)'], green: ['var(--green)', 'rgba(16,185,129,.10)'] };
  const [c, bg] = map[tone] || map.green;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,.55)' }}>{label}</span>
      <span style={{ padding: '4px 8px', background: bg, border: `1px solid ${c}33`, color: c, fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 800 }}>
        {value}
      </span>
    </div>
  );
}

function KeyStatus({ pct, status }) {
  const s = String(status || '').toLowerCase();
  const tone = pct > 100 ? 'red' : pct > 90 ? 'amber' : s === 'active' ? 'green' : 'amber';
  const map = {
    green: ['var(--green)', 'Active'],
    amber: ['var(--amber)', 'At Risk'],
    red: ['var(--red)', 'Over Limit'],
  };
  const [c, label] = map[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 999, background: `${c}12`, border: `1px solid ${c}33` }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: c }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: c }}>{label}</span>
    </span>
  );
}

window.PageKeys = PageKeys;

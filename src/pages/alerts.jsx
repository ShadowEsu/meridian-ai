// Alerts — variant-i refined.

const ALERT_STATE = {
  triggered: { color: 'var(--red)',     label: 'Triggered',  bg: 'rgba(239,86,72,.10)',  border: 'rgba(239,86,72,.30)' },
  active:    { color: 'var(--good)',    label: 'Active',     bg: 'rgba(63,179,127,.08)', border: 'rgba(63,179,127,.25)' },
  warning:   { color: 'var(--amber-2)', label: 'Triggered ×2', bg: 'rgba(232,160,74,.10)', border: 'rgba(232,160,74,.30)' },
  paused:    { color: 'var(--text-mute)', label: 'Paused',   bg: 'rgba(255,255,255,.02)', border: 'var(--line)' },
};

function PageAlerts() {
  const M = window.MERIDIAN;
  const [show, setShow] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  const { items, error: listError, refresh } = window.MeridianAPI.useList(
    () => window.MeridianAPI.alerts.list(),
    { alerts: M.ALERTS || [] }
  );
  const alerts = items ? (items.alerts || items) : [];

  function emptyForm() {
    return { name: '', type: 'team_budget', teamId: '', virtualKeyId: '', agentId: '',
             thresholdUsd: '', thresholdRpm: '', windowMinutes: '10' };
  }

  async function createAlert() {
    setCreateBusy(true);
    setCreateError(null);
    try {
      let payload = { name: form.name, type: form.type, target: {} };
      if (form.type === 'team_budget') {
        if (form.teamId) payload.target = { teamId: Number(form.teamId) };
        payload.thresholdUsd = form.thresholdUsd ? Number(form.thresholdUsd) : undefined;
      } else if (form.type === 'key_budget') {
        if (form.virtualKeyId) payload.target = { virtualKeyId: Number(form.virtualKeyId) };
        payload.thresholdUsd = form.thresholdUsd ? Number(form.thresholdUsd) : undefined;
      } else if (form.type === 'spike') {
        payload.thresholdRpm = form.thresholdRpm ? Number(form.thresholdRpm) : undefined;
        payload.windowMinutes = form.windowMinutes ? Number(form.windowMinutes) : 10;
      } else if (form.type === 'agent_loop') {
        if (form.agentId) payload.target = { agentId: Number(form.agentId) };
      }

      if (!window.MeridianAPI.live) {
        M.ALERTS.push({ id: Date.now(), state: 'active', triggered: 'Not yet triggered', channel: 'Email', count: 0, ...payload });
      } else {
        await window.MeridianAPI.alerts.create(payload);
      }
      refresh();
      setShow(false);
      setForm(emptyForm());
    } catch (e) {
      setCreateError(e.message || 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  }

  async function toggleAlert(id, currentState) {
    const next = currentState === 'paused' ? 'active' : 'paused';
    if (!window.MeridianAPI.live) {
      const a = M.ALERTS.find(a => a.id === id);
      if (a) a.state = next;
      refresh();
      return;
    }
    try {
      await window.MeridianAPI.alerts.update(id, { state: next });
      refresh();
    } catch (e) {
      console.error('Toggle alert failed', e.message);
    }
  }

  const triggeredCount = alerts.filter(a => a.state === 'triggered' || a.state === 'warning').length;

  return (
    <div className="overview-r">
      <PageHead
        title="Alerts"
        eyebrow="Operations"
        right={
          <>
            <span className="chip">
              {alerts.length} configured
              {triggeredCount > 0 ? <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {triggeredCount} triggered</span> : null}
            </span>
            <button type="button" className="cta-r" onClick={() => setShow(true)}>
              + Create alert
            </button>
          </>
        }
      />

      {listError && (
        <div className="card-r" style={{ padding: '12px 16px', color: 'var(--red)', borderColor: 'rgba(239,86,72,.3)', marginBottom: 12 }}>
          Failed to load alerts: {listError.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.length === 0 ? (
          <div className="card-r" style={{ padding: 36, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 14 }}>
              No alerts configured yet.
            </div>
            <button type="button" className="cta-r" onClick={() => setShow(true)}>
              Create your first alert
            </button>
          </div>
        ) : alerts.map(a => {
          const s = ALERT_STATE[a.state] || ALERT_STATE.paused;
          return (
            <div
              key={a.id}
              className="card-r"
              style={{
                padding: 16,
                borderColor: s.border,
                background: `linear-gradient(90deg, ${s.bg} 0%, transparent 60%), var(--surface)`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: s.bg, border: `1px solid ${s.border}`,
                      display: 'grid', placeItems: 'center', color: s.color, flex: '0 0 auto',
                    }}
                  >
                    {Icon.bell({ width: 16, height: 16 })}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 14, color: 'var(--text)' }}>
                      {a.name}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mute)', marginTop: 4, letterSpacing: '0.04em' }}>
                      {a.type ? a.type.replace(/_/g, ' ') : ''}
                      {a.triggered ? ` · ${a.triggered}` : ''}
                      {a.channel ? ` · notify ${a.channel}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '0 0 auto' }}>
                  <span
                    className="chip"
                    style={{
                      color: s.color, background: s.bg, borderColor: s.border,
                    }}
                  >
                    <span className="dot" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}></span>
                    {s.label}
                  </span>
                  <button
                    type="button"
                    className="ghost-r"
                    onClick={() => toggleAlert(a.id, a.state)}
                  >
                    {a.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="modal-backdrop" onClick={() => setShow(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: 0 }}>Create alert</h3>
            <p style={{ color: 'var(--text-mute)', fontSize: 13, marginTop: 4 }}>
              Notify your team when thresholds are crossed.
            </p>

            <div className="field">
              <label>Alert name</label>
              <input
                className="input"
                placeholder="e.g. Engineering over 90% budget"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>Type</label>
              <select
                className="select"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="team_budget">Team budget</option>
                <option value="key_budget">Key budget</option>
                <option value="agent_loop">Agent loop</option>
                <option value="spike">Spend spike</option>
              </select>
            </div>

            {form.type === 'team_budget' && (
              <>
                <div className="field">
                  <label>Team ID</label>
                  <input className="input" placeholder="Team ID (number)" value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Threshold (USD)</label>
                  <input className="input" type="number" placeholder="e.g. 3000" value={form.thresholdUsd} onChange={e => setForm(f => ({ ...f, thresholdUsd: e.target.value }))} />
                </div>
              </>
            )}

            {form.type === 'key_budget' && (
              <>
                <div className="field">
                  <label>Virtual Key ID</label>
                  <input className="input" placeholder="Virtual key ID (number)" value={form.virtualKeyId} onChange={e => setForm(f => ({ ...f, virtualKeyId: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Threshold (USD)</label>
                  <input className="input" type="number" placeholder="e.g. 500" value={form.thresholdUsd} onChange={e => setForm(f => ({ ...f, thresholdUsd: e.target.value }))} />
                </div>
              </>
            )}

            {form.type === 'spike' && (
              <>
                <div className="field">
                  <label>Requests per minute threshold</label>
                  <input className="input" type="number" placeholder="e.g. 100" value={form.thresholdRpm} onChange={e => setForm(f => ({ ...f, thresholdRpm: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Window (minutes)</label>
                  <input className="input" type="number" placeholder="e.g. 10" value={form.windowMinutes} onChange={e => setForm(f => ({ ...f, windowMinutes: e.target.value }))} />
                </div>
              </>
            )}

            {form.type === 'agent_loop' && (
              <div className="field">
                <label>Agent ID</label>
                <input className="input" placeholder="Agent ID (number)" value={form.agentId} onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))} />
              </div>
            )}

            {createError && (
              <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{createError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="ghost-r" onClick={() => { setShow(false); setCreateError(null); }}>
                Cancel
              </button>
              <button type="button" className="cta-r" onClick={createAlert} disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create'} <span className="arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.PageAlerts = PageAlerts;

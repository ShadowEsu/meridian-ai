function PageAlerts() {
  const M = window.MERIDIAN;
  const [show, setShow] = React.useState(false);

  // Create form state
  const [form, setForm] = React.useState({
    name: '',
    type: 'team_budget',
    teamId: '',
    virtualKeyId: '',
    agentId: '',
    thresholdUsd: '',
    thresholdRpm: '',
    windowMinutes: '10',
  });
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  const { items, error: listError, refresh } = window.MeridianAPI.useList(
    () => window.MeridianAPI.alerts.list(),
    { alerts: M.ALERTS || [] }
  );
  const alerts = items ? (items.alerts || items) : [];

  const stateConfig = {
    triggered: { color: '#EF4444', label: 'Triggered', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.3)' },
    active: { color: '#10B981', label: 'Active', bg: 'rgba(16,185,129,.06)', border: 'rgba(16,185,129,.25)' },
    warning: { color: '#F59E0B', label: 'Triggered ×2', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.3)' },
    paused: { color: '#5A616E', label: 'Paused', bg: 'rgba(255,255,255,.02)', border: 'var(--border)' },
  };

  async function createAlert() {
    setCreateBusy(true);
    setCreateError(null);
    try {
      // Build target and payload based on type
      let target = {};
      let payload = { name: form.name, type: form.type };

      if (form.type === 'team_budget') {
        if (form.teamId) target = { teamId: Number(form.teamId) };
        payload.target = target;
        payload.thresholdUsd = form.thresholdUsd ? Number(form.thresholdUsd) : undefined;
      } else if (form.type === 'key_budget') {
        if (form.virtualKeyId) target = { virtualKeyId: Number(form.virtualKeyId) };
        payload.target = target;
        payload.thresholdUsd = form.thresholdUsd ? Number(form.thresholdUsd) : undefined;
      } else if (form.type === 'spike') {
        payload.target = {};
        payload.thresholdRpm = form.thresholdRpm ? Number(form.thresholdRpm) : undefined;
        payload.windowMinutes = form.windowMinutes ? Number(form.windowMinutes) : 10;
      } else if (form.type === 'agent_loop') {
        if (form.agentId) target = { agentId: Number(form.agentId) };
        payload.target = target;
      }

      if (!window.MeridianAPI.live) {
        M.ALERTS.push({ id: Date.now(), state: 'active', triggered: 'Not yet triggered', channel: 'Email', count: 0, ...payload });
        refresh();
        setShow(false);
        setForm({ name: '', type: 'team_budget', teamId: '', virtualKeyId: '', agentId: '', thresholdUsd: '', thresholdRpm: '', windowMinutes: '10' });
      } else {
        await window.MeridianAPI.alerts.create(payload);
        refresh();
        setShow(false);
        setForm({ name: '', type: 'team_budget', teamId: '', virtualKeyId: '', agentId: '', thresholdUsd: '', thresholdRpm: '', windowMinutes: '10' });
      }
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
    <div className="content" data-screen-label="Alerts">
      <div className="between" style={{ marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)', fontWeight: 300 }}>
            {alerts.length} alerts configured · {triggeredCount} currently triggered
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShow(true)}>{Icon.plus()} Create Alert</button>
      </div>

      {listError && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,.08)', color: '#FCA5A5', fontSize: 13, borderRadius: 6, marginBottom: 12 }}>
          Failed to load alerts: {listError.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {alerts.map(a => {
          const s = stateConfig[a.state] || stateConfig.paused;
          return (
            <div key={a.id} className="card" style={{ padding: 18, borderColor: s.border, background: `linear-gradient(90deg, ${s.bg} 0%, transparent 60%), var(--surface)` }}>
              <div className="between">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, display: 'grid', placeItems: 'center', color: s.color }}>
                    {Icon.bell({ width: 16, height: 16 })}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 300, marginTop: 3 }}>
                      {a.type ? a.type.replace(/_/g, ' ') : ''}
                      {a.triggered ? ` · ${a.triggered}` : ''}
                      {a.channel ? ` · Notify: ${a.channel}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500, padding: '4px 10px', background: s.bg, border: `1px solid ${s.border}`, borderRadius: 5, color: s.color }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, boxShadow: `0 0 5px ${s.color}` }}></span>
                    {s.label}
                  </span>
                  <button className="btn btn-ghost" onClick={() => toggleAlert(a.id, a.state)}>
                    {a.state === 'paused' ? 'Resume' : 'Pause'}
                  </button>
                  <div
                    className={`toggle ${a.state !== 'paused' ? 'on' : ''}`}
                    onClick={() => toggleAlert(a.id, a.state)}
                    style={{ cursor: 'pointer' }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="modal-backdrop" onClick={() => setShow(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create alert</h3>
            <p className="sub">Notify your team when thresholds are crossed.</p>

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

            {/* Conditional fields per type */}
            {form.type === 'team_budget' && (
              <>
                <div className="field">
                  <label>Team ID</label>
                  <input
                    className="input"
                    placeholder="Team ID (number)"
                    value={form.teamId}
                    onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Threshold (USD)</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="e.g. 3000"
                    value={form.thresholdUsd}
                    onChange={e => setForm(f => ({ ...f, thresholdUsd: e.target.value }))}
                  />
                </div>
              </>
            )}

            {form.type === 'key_budget' && (
              <>
                <div className="field">
                  <label>Virtual Key ID</label>
                  <input
                    className="input"
                    placeholder="Virtual key ID (number)"
                    value={form.virtualKeyId}
                    onChange={e => setForm(f => ({ ...f, virtualKeyId: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Threshold (USD)</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="e.g. 500"
                    value={form.thresholdUsd}
                    onChange={e => setForm(f => ({ ...f, thresholdUsd: e.target.value }))}
                  />
                </div>
              </>
            )}

            {form.type === 'spike' && (
              <>
                <div className="field">
                  <label>Requests per minute threshold</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="e.g. 100"
                    value={form.thresholdRpm}
                    onChange={e => setForm(f => ({ ...f, thresholdRpm: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Window (minutes)</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="e.g. 10"
                    value={form.windowMinutes}
                    onChange={e => setForm(f => ({ ...f, windowMinutes: e.target.value }))}
                  />
                </div>
              </>
            )}

            {form.type === 'agent_loop' && (
              <div className="field">
                <label>Agent ID</label>
                <input
                  className="input"
                  placeholder="Agent ID (number)"
                  value={form.agentId}
                  onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}
                />
              </div>
            )}

            {createError && (
              <div style={{ color: '#FCA5A5', fontSize: 13, marginBottom: 8 }}>{createError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => { setShow(false); setCreateError(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={createAlert} disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.PageAlerts = PageAlerts;

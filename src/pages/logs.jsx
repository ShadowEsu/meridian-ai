/**
 * Maps a raw API request row to the shape expected by the table JSX.
 * API: { id, virtualKeyId, teamId, agentId, provider, model, promptTokens,
 *         completionTokens, latencyMs, costUsd, status, taskType, timestamp }
 * JSX: { id, time, model, modelFamily, routedFrom, team, inTok, outTok,
 *         cost, latency, status, saving }
 * @param {object} r - raw API row
 * @returns {object} adapted row
 */
function adaptApiRow(r) {
  const statusMap = { ok: 'Success', error: 'Error', rate_limited: 'Rate Limited' };
  // Derive a display model family from the model string (e.g. "claude-haiku-4-5" → "haiku")
  let family = 'other';
  const modelLower = (r.model || '').toLowerCase();
  if (modelLower.includes('haiku')) family = 'haiku';
  else if (modelLower.includes('sonnet')) family = 'sonnet';
  else if (modelLower.includes('opus')) family = 'opus';
  else if (modelLower.includes('gpt-4o-mini') || modelLower.includes('gpt4omini')) family = 'gpt4omini';
  else if (modelLower.includes('gpt-4o') || modelLower.includes('gpt4o')) family = 'gpt4o';
  else if (modelLower.includes('gpt-4.1-mini') || modelLower.includes('gpt-4.1-nano')) family = 'gpt4omini';
  else if (modelLower.includes('gpt')) family = 'gpt4o';
  else if (modelLower.includes('gemini-2.5-flash') || modelLower.includes('geminiflash')) family = 'geminiflash';
  else if (modelLower.includes('gemini')) family = 'geminipro';
  else if (modelLower.includes('mistral')) family = 'mistral';

  const ts = r.timestamp ? new Date(r.timestamp) : null;
  const time = ts ? ts.toISOString().replace('T', ' ').slice(0, 19) : '—';

  return {
    id:          r.id,
    time,
    model:       r.model || '—',
    modelFamily: family,
    routedFrom:  null,           // API doesn't expose routing info yet
    team:        r.teamId || '—',
    inTok:       r.promptTokens || 0,
    outTok:      r.completionTokens || 0,
    cost:        r.costUsd || 0,
    latency:     r.latencyMs || 0,
    status:      statusMap[r.status] || r.status || '—',
    saving:      0,              // not yet computed server-side
  };
}

/**
 * Fetches request logs from the live API when MeridianAPI.live is true,
 * otherwise returns a snapshot of the mock REQUEST_LOGS array.
 * Re-fetches whenever filters change.
 * @param {object} filters - query params forwarded to MeridianAPI.requests.list
 * @returns {{ requests: object[], total: number, error: Error|null }}
 */
function useLogs(filters) {
  const [out, setOut] = React.useState(() => {
    const logs = window.MERIDIAN.REQUEST_LOGS || [];
    return { requests: logs, total: logs.length };
  });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.live) return;
    let alive = true;
    window.MeridianAPI.requests.list(filters)
      .then(d => {
        if (alive) {
          setOut({
            requests: (d.requests || []).map(adaptApiRow),
            total: d.total || 0,
          });
        }
      })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  return { ...out, error };
}

function PageRequestLogs() {
  const M = window.MERIDIAN;
  const [model, setModel] = React.useState('all');
  const [team, setTeam] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState(null);
  const [sortKey, setSortKey] = React.useState('time');
  const [sortDir, setSortDir] = React.useState('desc');

  // Build the filter object passed to useLogs (and used for client-side
  // filtering in demo mode).
  const apiFilters = React.useMemo(() => {
    const f = {};
    if (model !== 'all') f.model = model;
    if (team !== 'all') f.teamId = team;
    if (status !== 'all') {
      const reverseMap = { Success: 'ok', Error: 'error', 'Rate Limited': 'rate_limited' };
      f.status = reverseMap[status] || status;
    }
    return f;
  }, [model, team, status]);

  const { requests: apiRows, total, error } = useLogs(apiFilters);

  // In demo mode, apiRows === mock REQUEST_LOGS (no live call fired).
  // Apply client-side filtering + sorting regardless of mode so the UI stays
  // interactive even when the API hasn't returned yet.
  const rows = React.useMemo(() => {
    let r = apiRows.slice();
    if (model !== 'all') r = r.filter(x => x.model === model);
    if (team !== 'all') r = r.filter(x => x.team === team);
    if (status !== 'all') r = r.filter(x => x.status === status);
    if (query) r = r.filter(x => String(x.id).toLowerCase().includes(query.toLowerCase()));
    r.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [apiRows, model, team, status, query, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  if (error) return <div className="meridian-error">{error.message}</div>;

  return (
    <div className="overview-r">
      <PageHead title="Audit log" eyebrow="Operations" right={
        <span className="chip">{total.toLocaleString()} total · last 50 shown</span>
      } />

      <div className="card-r" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" placeholder="Search request ID..." style={{ flex: '0 0 240px' }} value={query} onChange={e => setQuery(e.target.value)} />
          <select className="select" value={model} onChange={e => setModel(e.target.value)}>
            <option value="all">All models</option>
            {M.MODELS.map(m => <option key={m.id} value={m.short}>{m.name}</option>)}
          </select>
          <select className="select" value={team} onChange={e => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {M.TEAMS.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option>Success</option>
            <option>Error</option>
            <option>Rate Limited</option>
          </select>
          <button type="button" className="ghost-r" style={{ marginLeft: 'auto' }}>Export CSV</button>
        </div>
      </div>

      <div className="card-r" style={{ padding: 0, overflow: 'hidden' }}>
        <header className="card-head">
          <div className="l">
            <h3>{rows.length} requests</h3>
            <span className="sub">page 1 of {Math.max(1, Math.ceil(total / 50))} · 50 per page</span>
          </div>
        </header>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <SortTh k="id" label="Request ID" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh k="time" label="Timestamp" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh k="model" label="Model" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th>Routed From</th>
                <SortTh k="team" label="Team" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortTh k="inTok" label="In Tok" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortTh k="outTok" label="Out Tok" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortTh k="cost" label="Cost" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <SortTh k="latency" label="Latency" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <React.Fragment key={r.id + i}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="mono">{r.id}</td>
                    <td className="mono dim" style={{ fontSize: 11 }}>{r.time}</td>
                    <td><span className={`model-badge model-${r.modelFamily}`}>{r.model}</span></td>
                    <td className="dim">{r.routedFrom || '—'}</td>
                    <td>{r.team}</td>
                    <td style={{ textAlign: 'right' }}>{r.inTok.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{r.outTok.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 400 }}>${r.cost.toFixed(4)}</td>
                    <td style={{ textAlign: 'right' }} className="dim">{r.latency}ms</td>
                    <td>
                      <span className={`dot-status status-${r.status === 'Success' ? 'green' : r.status === 'Error' ? 'red' : 'amber'}`}></span>
                      <span style={{ fontSize: 11.5 }}>{r.status}</span>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td colSpan="10" style={{ background: '#0C0E14', padding: 18 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
                          <DetailItem label="Routing decision" value={r.routedFrom ? `${r.routedFrom} → ${r.model}` : 'No reroute'} />
                          <DetailItem label="Cost saved" value={r.saving > 0 ? '$' + r.saving.toFixed(4) : '—'} highlight={r.saving > 0} />
                          <DetailItem label="Loop contribution" value="None" />
                          <DetailItem label="Flags" value={r.status === 'Error' ? 'API error' : r.status === 'Rate Limited' ? 'Rate limited' : 'Clean'} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ex-foot" style={{ justifyContent: 'space-between' }}>
          <span>Showing 1–{rows.length} of {total.toLocaleString()}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="ghost-r">‹ Prev</button>
            <button type="button" className="ghost-r" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text)' }}>1</button>
            <button type="button" className="ghost-r">2</button>
            <button type="button" className="ghost-r">Next ›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortTh({ k, label, sortKey, sortDir, onClick, align }) {
  return (
    <th onClick={() => onClick(k)} style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left' }}>
      {label}{sortKey === k && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function DetailItem({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--text-mute)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 6, color: highlight ? 'var(--green-2)' : 'var(--text)', fontWeight: highlight ? 500 : 300 }}>{value}</div>
    </div>
  );
}

window.PageRequestLogs = PageRequestLogs;

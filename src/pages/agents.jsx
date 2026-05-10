function PageAgents() {
  const M = window.MERIDIAN;

  const { items, error: listError, refresh } = window.MeridianAPI.useList(
    () => window.MeridianAPI.agents.list(),
    { agents: M.AGENTS || [] }
  );
  const agents = items ? (items.agents || items) : [];

  // Adapt API agent shape → display shape used by StitchAgentCard / the page
  function adaptAgent(a) {
    // Live API: { id, name, description, status, maxRunCostUsd, maxLoopIterations, createdAt }
    // Demo:     { name, team, status, duration, calls, cost, loopRisk, sparkType }
    if (a.maxRunCostUsd !== undefined || a.description !== undefined) {
      return {
        id: a.id,
        name: a.name,
        team: a.teamId ? `Team ${a.teamId}` : '—',
        status: a.status === 'running' ? 'running' : a.status === 'paused' ? 'warning' : 'terminated',
        duration: '—',
        calls: 0,
        cost: 0,
        loopRisk: 0,
        sparkType: 'flat',
        _live: true,
      };
    }
    return { id: a.id || a.name, ...a };
  }

  const displayAgents = agents.map(adaptAgent);

  const warnAgent = displayAgents.find(a => a.status === 'warning') || displayAgents[0] || {};
  const activeCount = displayAgents.filter(a => a.status === 'running').length || 0;
  const riskCount = displayAgents.filter(a => a.status === 'warning').length || 0;

  async function startRun(agentId) {
    if (!window.MeridianAPI.live) return; // demo: noop
    try {
      await window.MeridianAPI.agents.startRun(agentId);
      refresh();
    } catch (e) {
      console.error('Start run failed', e.message);
    }
  }

  return (
    <div className="overview-r">
      <PageHead title="Agents" eyebrow="Operations" right={
        <span className="chip">
          <span className="dot" style={{ background: riskCount > 0 ? 'var(--red)' : 'var(--good)' }}></span>
          {activeCount || displayAgents.length} active
          {riskCount > 0 ? <span style={{ color: 'var(--red)', marginLeft: 6 }}>· {riskCount} at risk</span> : null}
        </span>
      } />

      {/* Runaway alert bar */}
      <div
        className="card-r"
        style={{
          padding: '12px 18px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'linear-gradient(90deg, rgba(239,86,72,.10) 0%, rgba(239,86,72,.02) 60%), var(--surface)',
          borderColor: 'rgba(239,86,72,.30)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ color: 'var(--red)', display: 'grid', placeItems: 'center' }}>
            {Icon.warning({ width: 16, height: 16 })}
          </div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.18em', fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            Runaway risk
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Agent "<b style={{ color: 'var(--text)' }}>{warnAgent?.name || 'Neural_Scraper_v4'}</b>" is executing a recursive loop in Production.
          </div>
        </div>
        <button type="button" className="cta-r" style={{ background: 'var(--red)', color: '#fff' }}>
          Intercept now
        </button>
      </div>

      {listError && (
        <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,.08)', color: '#FCA5A5', fontSize: 13, borderRadius: 6, marginBottom: 12 }}>
          Failed to load agents: {listError.message}
        </div>
      )}

      {/* 3-up stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <div className="card-r" style={{ padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Active sessions
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8 }}>
            {activeCount || 18}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
            running now
          </div>
        </div>
        <div className="card-r" style={{ padding: 18, borderColor: riskCount > 0 ? 'rgba(232,160,74,.30)' : undefined }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: riskCount > 0 ? 'var(--amber-2)' : 'var(--text-faint)' }}>
            At risk
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8, color: riskCount > 0 ? 'var(--amber-2)' : 'var(--text)' }}>
            {riskCount || 2}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
            loop / cap thresholds
          </div>
        </div>
        <div className="card-r" style={{ padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Cost avoided · MTD
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, marginTop: 8, color: 'var(--good)' }}>
            $9,410
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-mute)', marginTop: 6 }}>
            42 autonomous intercepts · last 24h
          </div>
        </div>
      </div>

      {/* Active sessions list */}
      <article className="card-r" style={{ padding: 0, marginBottom: 14 }}>
        <header className="card-head">
          <div className="l">
            <h3>Active sessions</h3>
            <span className="sub">long-running agents · loop protection on</span>
          </div>
          <div className="r">
            <span className="chip"><span className="dot"></span>{activeCount || 18} active</span>
            {riskCount > 0 ? <span className="chip amber"><span className="dot"></span>{riskCount} at risk</span> : null}
          </div>
        </header>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {(displayAgents.length > 0 ? displayAgents : M.AGENTS).slice(0, 4).map(a => (
            <StitchAgentCard key={a.name || a.id} a={a} onStartRun={startRun} />
          ))}
        </div>
      </article>

      {/* Historical runs */}
      <article className="card-r" style={{ padding: 0 }}>
        <header className="card-head">
          <div className="l">
            <h3>Historical runs</h3>
            <span className="sub">{M.AGENT_HISTORY.length} sessions · last 14 days</span>
          </div>
          <div className="r">
            <button type="button" className="ghost-r">Export</button>
          </div>
        </header>
        <table className="models-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 22 }}>Agent</th>
              <th>Team</th>
              <th>Start</th>
              <th>Duration</th>
              <th style={{ textAlign: 'right' }}>Calls</th>
              <th style={{ textAlign: 'right' }}>Cost</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'right', paddingRight: 22 }}>Avoided</th>
            </tr>
          </thead>
          <tbody>
            {M.AGENT_HISTORY.map((h, i) => {
              const statusColor = h.status === 'completed' ? 'var(--good)' : h.status === 'warning' ? 'var(--amber-2)' : 'var(--red)';
              return (
                <tr key={i}>
                  <td style={{ paddingLeft: 22, fontWeight: 500 }}>{h.name}</td>
                  <td style={{ color: 'var(--text-mute)' }}>{h.team}</td>
                  <td className="mono-cell" style={{ fontSize: 11, color: 'var(--text-mute)' }}>{h.start}</td>
                  <td className="mono-cell">{h.duration}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>{h.calls.toLocaleString()}</td>
                  <td className="mono-cell" style={{ textAlign: 'right' }}>${h.cost}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="chip" style={{
                      color: statusColor,
                      borderColor: `color-mix(in oklch, ${statusColor} 30%, transparent)`,
                      background: `color-mix(in oklch, ${statusColor} 10%, transparent)`,
                    }}>
                      <span className="dot" style={{ background: statusColor }}></span>
                      {h.status}
                    </span>
                  </td>
                  <td className="mono-cell" style={{ textAlign: 'right', paddingRight: 22, color: h.avoided > 0 ? 'var(--good)' : 'var(--text-mute)', fontWeight: h.avoided > 0 ? 500 : 400 }}>
                    {h.avoided > 0 ? '$' + h.avoided.toLocaleString() : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </div>
  );
}

/**
 * Renders recent runs for a live agent.
 * Falls back to MERIDIAN.AGENT_RUNS_BY_AGENT in demo mode.
 * @param {{ agentId: number|string }} props
 */
function AgentRuns({ agentId }) {
  const [runs, setRuns] = React.useState([]);
  React.useEffect(() => {
    if (!window.MeridianAPI.live) {
      const M = window.MERIDIAN;
      setRuns((M.AGENT_RUNS_BY_AGENT && M.AGENT_RUNS_BY_AGENT[agentId]) || []);
      return;
    }
    let alive = true;
    window.MeridianAPI.agents.runs(agentId).then(d => { if (alive) setRuns(d.runs || d); });
    return () => { alive = false; };
  }, [agentId]);

  if (!runs.length) return null;
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
      {runs.map(r => (
        <div key={r.id} className="agent-run-row" style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', display: 'flex', gap: 8 }}>
          <span>{r.startedAt}</span>
          <span>·</span>
          <span>{r.requestCount} reqs</span>
          <span>·</span>
          <span>${Number(r.costUsd || 0).toFixed(4)}</span>
          <span>·</span>
          <span>{r.status}</span>
        </div>
      ))}
    </div>
  );
}

const th = { padding: '12px 16px', fontWeight: 700, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase' };
const td = { padding: '12px 16px' };

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  const map = {
    completed: ['var(--green)', 'Intercepted'],
    warning: ['var(--amber)', 'Warning'],
    terminated: ['var(--red)', 'Forced kill'],
  };
  const [c, label] = map[s] || ['rgba(255,255,255,.25)', 'Normal exit'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />
      <span style={{ fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 700, color: c }}>{label}</span>
    </span>
  );
}

function KillCheck({ label, sub }) {
  return (
    <label style={{ display: 'flex', gap: 10, padding: 10, background: 'var(--surface-2)', border: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}>
      <input type="checkbox" style={{ marginTop: 2 }} />
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.88)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.35)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>{sub}</div>
      </div>
    </label>
  );
}

function StitchAgentCard({ a, onStartRun }) {
  const isRisk = a.status === 'warning';
  const riskColor = isRisk ? 'var(--red)' : 'rgba(255,255,255,.55)';
  const riskLabel = isRisk ? 'LOOP RISK' : 'STABLE';
  const riskPct = typeof a.loopRisk === 'number' ? a.loopRisk : 12;
  const bars = isRisk ? [2, 4, 6, 5, 8] : [1, 2, 1, 3, 2];
  return (
    <div className="glass-panel" style={{ padding: 16, borderColor: 'var(--border-2)' }}>
      <div className="between" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'rgba(255,255,255,.88)', fontFamily: 'var(--font-display)' }}>{a.name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginTop: 4 }}>ID: {a.id || '0x9482..FE4'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700, color: riskColor }}>{riskLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: riskColor, marginTop: 4 }}>{riskPct}%</div>
        </div>
      </div>
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,.35)' }}>SESSION COST</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginTop: 6 }}>${Number(a.cost || 0).toFixed(2)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ width: 96, height: 34, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, height: h * 4, background: isRisk ? 'rgba(239,68,68,.25)' : 'rgba(99,102,241,.45)' }} />
            ))}
            <div style={{ flex: 1, height: (isRisk ? 8 : 6) * 4, background: isRisk ? 'var(--red)' : 'var(--indigo)' }} />
          </div>
          {onStartRun && (
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => onStartRun(a.id)}
              title="Start a new run for this agent"
            >
              Start run
            </button>
          )}
        </div>
      </div>
      {/* Runs sub-list (live mode only) */}
      {window.MeridianAPI && window.MeridianAPI.live && a.id && (
        <AgentRuns agentId={a.id} />
      )}
    </div>
  );
}

function AgentCard({ a }) {
  const statusColor = a.status === 'running' ? 'var(--green)' : a.status === 'warning' ? 'var(--amber)' : 'var(--red)';
  const statusLabel = a.status === 'running' ? 'Running' : a.status === 'warning' ? 'Warning' : 'Terminated';
  const isWarning = a.status === 'warning';
  const isTerminated = a.status === 'terminated';

  // Sparkline data
  const sparkData = a.sparkType === 'spike' ? [10, 11, 12, 14, 18, 28, 42, 60, 85, 120]
    : a.sparkType === 'runaway' ? [12, 24, 48, 96, 180, 280, 380, 480, 580, 700]
    : Array.from({ length: 10 }, (_, i) => 20 + Math.sin(i) * 3 + i * 0.5);

  return (
    <div className="card" style={{
      borderColor: isWarning ? 'rgba(245,158,11,.4)' : isTerminated ? 'rgba(239,68,68,.3)' : undefined,
      boxShadow: isWarning ? '0 0 0 1px rgba(245,158,11,.2), 0 0 30px -10px rgba(245,158,11,.3)' : undefined,
      background: isWarning ? 'radial-gradient(ellipse at top right, rgba(245,158,11,.06), transparent 60%), var(--surface)' : undefined,
    }}>
      <div className="between">
        <div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{a.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 300, marginTop: 2 }}>{a.team} · {a.duration}</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: statusColor, fontWeight: 500, padding: '4px 10px', background: `${statusColor}1a`, border: `1px solid ${statusColor}40`, borderRadius: 5 }}>
          <span className={`dot-status ${a.status === 'running' ? 'status-green' : a.status === 'warning' ? 'status-amber' : 'status-red'}`}></span>
          {statusLabel}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18 }}>
        <div>
          <div className="kpi-label">Calls</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{(a.calls || 0).toLocaleString()}</div>
        </div>
        <div>
          <div className="kpi-label">Cost</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: (a.cost || 0) > 30 ? 'var(--amber-2)' : 'var(--text)' }}>${Number(a.cost || 0).toFixed(2)}</div>
        </div>
        <div>
          <div className="kpi-label">Loop risk</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4, color: (a.loopRisk || 0) > 70 ? '#FCA5A5' : (a.loopRisk || 0) > 40 ? 'var(--amber-2)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{a.loopRisk || 0}%</div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Sparkline data={sparkData} color={isWarning ? '#F59E0B' : isTerminated ? '#EF4444' : '#10B981'} width={180} height={36} fill={true} />
        <div style={{ flex: 1 }}></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 9px' }}>{Icon.pause()}</button>
          <button className="btn btn-danger" style={{ padding: '6px 10px' }}>Terminate</button>
          <button className="btn">Logs</button>
        </div>
      </div>
    </div>
  );
}

function KillRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 300 }}>{label}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        <div className="toggle on"></div>
      </div>
    </div>
  );
}

/** Small stat block (was shared with Model Router page; keep local now that router script is optional). */
function Stat({ label, value, sub, highlight }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em', color: highlight ? 'var(--green-2)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-mute)', fontWeight: 300, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

window.PageAgents = PageAgents;

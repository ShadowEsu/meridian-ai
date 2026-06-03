// Overview page — variant-i refined design
// Hero (ticking $) + alert · routing constellation + expensive requests ·
// spend flow stacked bars · team budgets + provider mix · footer.

const PROVIDER_COLOR = {
  openai:    { c: 'var(--oa)',  c2: 'var(--oa-2)' },
  anthropic: { c: 'var(--an)',  c2: 'var(--an-2)' },
  google:    { c: 'var(--go)',  c2: 'var(--go-2)' },
  other:     { c: 'var(--ot)',  c2: 'var(--ot)' },
};

/** Persist hero spend across Overview remounts (sidebar re-click). */
let _heroSpendCache = null;
function heroSpendInitial(data) {
  if (_heroSpendCache != null) return _heroSpendCache;
  _heroSpendCache = data.totalSpendUsd + 0.32;
  return _heroSpendCache;
}
function heroSpendSet(next) {
  _heroSpendCache = next;
  return next;
}
function familyToProvider(family) {
  if (family === 'gpt')    return 'openai';
  if (family === 'claude') return 'anthropic';
  if (family === 'gemini') return 'google';
  return 'other';
}
function providerColor(family) {
  return PROVIDER_COLOR[familyToProvider(family)].c;
}

/**
 * Live data (sample mode falls back to MERIDIAN constants).
 */
function useOverviewData() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.live) {
      const M = window.MERIDIAN;
      setData({
        totalSpendUsd:       M.KPI.totalSaved,    // map: "Total spend MTD" — using the bigger demo number
        totalRequests:       M.KPI.totalCalls,
        budgetCap:           M.KPI.budgetCap,
        projectedEOM:        M.KPI.projectedEOM,
        savingsUsd:          M.KPI.routingSavings,
        teams:               M.TEAMS,
        models:              M.MODELS,
        fmtMoney:            M.fmtMoney,
        fmtNum:              M.fmtNum,
      });
      return;
    }
    let alive = true;
    window.MeridianAPI.kpi.overview()
      .then(d => {
        if (alive) {
          const M = window.MERIDIAN;
          setData({
            ...d,
            totalSpendUsd: d.totalSpendUsd ?? M.KPI.totalSaved,
            teams:         M.TEAMS,
            models:        M.MODELS,
            fmtMoney:      M.fmtMoney,
            fmtNum:        M.fmtNum,
          });
        }
      })
      .catch(e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, []);

  return { data, error };
}

function PageOverview() {
  const { data, error } = useOverviewData();
  if (error) return <div className="meridian-error">{error.message}</div>;
  if (!data) return <div className="meridian-loading">Loading…</div>;

  const M = window.MERIDIAN;
  const saved = data.savingsUsd || M.KPI.routingSavings || 14200;

  return (
    <div className="overview-r">
      <SavingsStrip saved={saved} fmtMoney={data.fmtMoney} />
      <PageHeaderR />
      <HeroRow data={data} />
      <MidRow data={data} />
      <SpendFlowSection data={data} />
      <TeamsAndProviders data={data} />
      <FooterBar />
    </div>
  );
}

function SavingsStrip({ saved, fmtMoney }) {
  const UI = window.MeridianUI;
  return (
    <section className="savings-strip card-r" aria-label="API savings">
      <div className="savings-strip-main">
        <span className="savings-strip-badge">ML router</span>
        <div>
          <div className="savings-strip-title">Save API credits — route to the right model</div>
          <div className="savings-strip-sub">
            Smart-routing cut spend by <b>{fmtMoney(saved)}</b> vs gpt-4-only baseline this month
          </div>
        </div>
      </div>
      <div className="savings-strip-actions">
        <button type="button" className="cta-r" onClick={() => UI && UI.navigate('routing')}>
          View routing rules
        </button>
        <button type="button" className="ghost-r" onClick={() => UI && UI.navigate('models')}>
          Compare models
        </button>
      </div>
    </section>
  );
}

function PageHeaderR() {
  const [range, setRange] = React.useState('MTD');
  const UI = window.MeridianUI;
  return (
    <header className="pghead">
      <div className="pghead-l">
        <h1>Overview</h1>
        <span className="crumb"><a href="#">Workspace</a> <span>·</span> Acme · production</span>
      </div>
      <div className="pghead-r">
        <span className="liveind">
          <span className="pdot" aria-hidden="true"></span>
          proxy us-east-1 · 4ms p50
        </span>
        <div className="timepick" role="tablist" aria-label="Time range">
          {['24H','7D','MTD','90D'].map(r => (
            <button
              key={r}
              type="button"
              className={range === r ? 'on' : ''}
              onClick={() => {
                setRange(r);
                if (UI) UI.toast('Showing ' + r + ' range (preview)', 'info');
              }}
              aria-current={range === r ? 'true' : undefined}
            >{r}</button>
          ))}
        </div>
        <button type="button" className="iconbtn" title="Search" aria-label="Search" onClick={() => UI && UI.toast('Press ⌘K to search', 'info')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
        </button>
        <button type="button" className="iconbtn" title="Export" aria-label="Export" onClick={() => UI && UI.exportData('Overview')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 21h14"/>
          </svg>
        </button>
      </div>
    </header>
  );
}

function HeroRow({ data }) {
  return (
    <section className="hero-grid">
      <article className="card-r hero-num-card">
        <HeroNumber data={data} />
      </article>
      <article className="card-r alert-card mc-critical-card">
        <AlertCard />
      </article>
    </section>
  );
}

function HeroNumber({ data }) {
  const [val, setVal] = React.useState(() => heroSpendInitial(data));
  const [delta, setDelta] = React.useState('');
  const [tick, setTick] = React.useState(false);
  const numRef = React.useRef(null);
  const pendingRef = React.useRef(false);

  function trigger(inc) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setVal(v => heroSpendSet(v + inc));
    setDelta(`+$${inc.toFixed(2)}`);
    setTick(true);
    try { window.dispatchEvent(new Event('meridian:hero-tick')); } catch (_) {}
    setTimeout(() => {
      setTick(false);
      pendingRef.current = false;
    }, 320);
  }

  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => trigger(0.18 + Math.random() * 1.4), 5500);
    return () => clearInterval(id);
  }, []);

  // expose tick for routing constellation
  React.useEffect(() => {
    window.__meridianHeroTick = trigger;
    return () => { delete window.__meridianHeroTick; };
  }, []);

  const dollars = Math.floor(val);
  const cents = Math.round((val - dollars) * 100);
  const fmtDollars = dollars.toLocaleString();
  const baselineDelta = data.fmtMoney(data.savingsUsd || 14200);
  const MC = window.MissionControl;
  const health = MC && MC.spendHealth
    ? MC.spendHealth(val, data.budgetCap, data.projectedEOM)
    : 'warn';
  const burnSpeed = health === 'critical' ? 1.4 : health === 'warn' ? 1.1 : 1;

  return (
    <>
      <div className="num-eye">
        <span>MTD SPEND</span>
        <span className="sep">·</span>
        <span className="live"><span className="pdot" aria-hidden="true"></span>TICKING</span>
        <span className="sep">·</span>
        <span>vs $107.6k baseline</span>
      </div>
      <div className="mc-heartbeat-wrap">
        <div className="hero-num-row">
          <h2 ref={numRef} className={`hero-num mc-heartbeat-num tnum mc-health-${health}${tick ? ' tick' : ''}`}>
            ${fmtDollars}
            <span className="cents">.{String(cents).padStart(2, '0')}</span>
          </h2>
          <span
            className={`hero-delta mono${delta ? ' fly' : ''}`}
            key={delta}
          >{delta}</span>
          <span className="vs-base">
            <span className="lab">SAVED</span>
            <span className="v">−{baselineDelta} (13.2%)</span>
          </span>
        </div>
        {MC && MC.HeartbeatWaveform
          ? <MC.HeartbeatWaveform health={health} speed={burnSpeed} />
          : null}
      </div>
      <div className="ministats-r">
        <Ministat k="CALLS / 30d" v={data.fmtNum(data.totalRequests)} sub="+8.4% w/w" />
        <Ministat k="CACHE HIT" v="38.2%" vClass="good" sub="saving $4.1k" />
        <Ministat k="BURN / hr" v="$132" sub="norm $98" />
        <Ministat k="CAP" v={data.fmtMoney(data.budgetCap)} vClass="warn" sub="exceeds in 6d" />
      </div>
    </>
  );
}

function Ministat({ k, v, vClass, sub }) {
  return (
    <div className="ms">
      <span className="k">{k}</span>
      <span className={`v tnum${vClass ? ' ' + vClass : ''}`}>{v}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}

function AlertCard() {
  const UI = window.MeridianUI;
  return (
    <>
      <div className="alert-head">
        <span className="mc-radar-ping" aria-hidden="true"></span>
        CRITICAL · ENGINEERING<span className="sep">·</span><span className="ts">2m ago</span>
      </div>
      <h3 className="alert-headline">
        Spend exceeds capacity in{' '}
        <span className="countdown">six&nbsp;days<span className="pdot" aria-hidden="true"></span></span>
      </h3>
      <div className="drain-r" aria-hidden="true"></div>
      <div className="drain-labels-r">
        <span>burn ▲</span><span>cap reached</span>
      </div>
      <p className="alert-body">
        Engineering is at <b>$32,400 / 108% of cap</b>. The data-science / grader agent is firing{' '}
        <b>4.2× normal rate</b>. Smart-routing has saved $14,200 vs gpt-4-only baseline,
        but it isn't enough at this burn.
      </p>
      <div className="alert-actions">
        <button type="button" className="cta-r" onClick={() => UI && UI.investigate()}>
          Investigate <span className="arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" className="ghost-r" onClick={() => UI && UI.pauseAutoRoute()}>Pause auto-route</button>
        <button type="button" className="ghost-r" onClick={() => UI && UI.snooze(1)}>Snooze 1h</button>
      </div>
    </>
  );
}

function MidRow({ data }) {
  return (
    <section className="mid-grid">
      <article className="card-r route-card">
        <header className="card-head">
          <div className="l">
            <h3>Smart routing — live</h3>
            <span className="sub">request → router → chosen model</span>
          </div>
          <div className="r">
            <span className="chip"><span className="dot"></span>healthy</span>
            <span className="chip amber"><span className="dot"></span>cache 38%</span>
            <button
              type="button"
              className="ghost-r"
              style={{ height: 28, fontSize: 11 }}
              onClick={() => window.MeridianUI && window.MeridianUI.navigate('routing')}
            >
              Rules →
            </button>
          </div>
        </header>
        <RoutingConstellation />
      </article>

      <article className="card-r ex-card">
        <header className="card-head">
          <div className="l">
            <h3>Expensive requests</h3>
            <span className="sub">live · over $1.00 · click to inspect</span>
          </div>
          <div className="r">
            <span className="chip">last 5 min</span>
          </div>
        </header>
        <ExpensiveRequests />
      </article>
    </section>
  );
}

const ROUTE_INPUTS = [
  { id: 'eng', tag: 'EN', name: 'Engineering', sub: 'code · grader · 18k req/h', pct: '42%', c: 'var(--red)' },
  { id: 'rsh', tag: 'RS', name: 'Research',    sub: 'analysis · long-ctx',       pct: '22%', c: 'var(--go)' },
  { id: 'prd', tag: 'PR', name: 'Product',     sub: 'chat · summarize',          pct: '18%', c: 'var(--oa)' },
  { id: 'sup', tag: 'SU', name: 'Support',     sub: 'tickets · classify',        pct: '12%', c: 'var(--an)' },
  { id: 'grw', tag: 'GR', name: 'Growth',      sub: 'copy · embed',              pct: '6%',  c: 'var(--ot)' },
];
const ROUTE_MODELS = [
  { id: 'gpt4o',  tag: '4o', name: 'gpt-4o',            sub: 'OpenAI · $23.6k MTD',    pct: '38%', c: 'var(--oa)' },
  { id: 'sonnet', tag: '3.5', name: 'claude-3.5-sonnet', sub: 'Anthropic · $20.2k MTD', pct: '26%', c: 'var(--an)' },
  { id: 'gem15',  tag: 'G1', name: 'gemini-1.5-pro',     sub: 'Google · $9.9k MTD',     pct: '14%', c: 'var(--go)' },
  { id: 'haiku',  tag: 'HK', name: 'claude-haiku',       sub: 'Anthropic · $5.7k MTD',  pct: '12%', c: 'var(--an-2)' },
  { id: 'mini',   tag: '4m', name: 'gpt-4o-mini',        sub: 'OpenAI · $5.9k MTD',     pct: '10%', c: 'var(--oa-2)' },
];
const ROUTE_MAP = {
  eng: [['gpt4o', 0.45], ['sonnet', 0.30], ['mini', 0.15], ['haiku', 0.10]],
  rsh: [['sonnet', 0.40], ['gem15', 0.30], ['gpt4o', 0.20], ['haiku', 0.10]],
  prd: [['gpt4o', 0.40], ['mini', 0.30], ['haiku', 0.20], ['gem15', 0.10]],
  sup: [['haiku', 0.50], ['mini', 0.30], ['sonnet', 0.20]],
  grw: [['mini', 0.50], ['haiku', 0.30], ['gpt4o', 0.20]],
};

function RoutingConstellation() {
  const stageRef = React.useRef(null);
  const svgRef = React.useRef(null);
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const stage = stageRef.current;
    const svg = svgRef.current;
    const canvas = canvasRef.current;
    if (!stage || !svg || !canvas) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let RW = 0, RH = 0;
    const particles = [];

    function nodeCenter(el, parentR) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width/2 - parentR.left, y: r.top + r.height/2 - parentR.top };
    }

    function drawConnectors() {
      const stageR = stage.getBoundingClientRect();
      RW = stageR.width; RH = stageR.height;
      canvas.width = Math.round(RW * DPR);
      canvas.height = Math.round(RH * DPR);
      canvas.style.width = RW + 'px';
      canvas.style.height = RH + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      svg.setAttribute('viewBox', `0 0 ${RW} ${RH}`);

      const router = stage.querySelector('.router');
      if (!router) return;
      const rc = nodeCenter(router, stageR);
      const inputs = stage.querySelectorAll('.input-node');
      const models = stage.querySelectorAll('.model-node');
      let html = '';
      inputs.forEach(inp => {
        const p = nodeCenter(inp, stageR);
        const c = inp.dataset.color || '#888';
        const cx1 = (p.x + rc.x) / 2 + 20;
        html += `<path d="M ${p.x+8} ${p.y} C ${cx1} ${p.y}, ${cx1} ${rc.y}, ${rc.x-26} ${rc.y}" fill="none" stroke="${c}" stroke-opacity="0.18" stroke-width="2.5"/>`;
        html += `<path d="M ${p.x+8} ${p.y} C ${cx1} ${p.y}, ${cx1} ${rc.y}, ${rc.x-26} ${rc.y}" fill="none" stroke="${c}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="2 5" class="dashflow" style="--delay:${Math.random()}s"/>`;
      });
      models.forEach(m => {
        const p = nodeCenter(m, stageR);
        const c = m.dataset.color || '#888';
        const cx1 = (rc.x + p.x) / 2 - 20;
        html += `<path d="M ${rc.x+26} ${rc.y} C ${cx1} ${rc.y}, ${cx1} ${p.y}, ${p.x-8} ${p.y}" fill="none" stroke="${c}" stroke-opacity="0.18" stroke-width="2.5"/>`;
        html += `<path d="M ${rc.x+26} ${rc.y} C ${cx1} ${rc.y}, ${cx1} ${p.y}, ${p.x-8} ${p.y}" fill="none" stroke="${c}" stroke-opacity="0.55" stroke-width="1" stroke-dasharray="2 5" class="dashflow" style="--delay:${Math.random()}s"/>`;
      });
      svg.innerHTML = html;
    }

    function bezier3(t, p0, p1, p2, p3) {
      const u = 1 - t;
      return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
    }
    function hexA(hex, a) {
      const h = hex.replace('#','');
      const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    function pickByWeight(arr) {
      const total = arr.reduce((s,x) => s + x[1], 0);
      let r = Math.random() * total;
      for (const [k,w] of arr) { r -= w; if (r <= 0) return k; }
      return arr[arr.length-1][0];
    }

    function spawnParticle() {
      if (reduce) return;
      const inputs = Array.from(stage.querySelectorAll('.input-node'));
      const inp = inputs[Math.floor(Math.random() * inputs.length)];
      if (!inp) return;
      const inputId = inp.dataset.id;
      const modelId = pickByWeight(ROUTE_MAP[inputId] || [['gpt4o', 1]]);
      const modelEl = stage.querySelector(`.model-node[data-id="${modelId}"]`);
      const router = stage.querySelector('.router');
      if (!modelEl || !router) return;
      const stageR = stage.getBoundingClientRect();
      const p0 = nodeCenter(inp, stageR); p0.x += 8;
      const p1 = nodeCenter(router, stageR);
      const p2 = nodeCenter(modelEl, stageR); p2.x -= 8;
      particles.push({
        p0, p1, p2,
        t: 0, dur1: 700 + Math.random()*200, dur2: 700 + Math.random()*200,
        phase: 1,
        colorIn: inp.dataset.color || '#888',
        colorOut: modelEl.dataset.color || '#888',
        size: 1.9,
        inEl: inp, outEl: modelEl,
      });
      inp.classList.remove('flash');
      void inp.offsetWidth;
      inp.classList.add('flash');
    }

    let spawnAcc = 0;
    let last = performance.now();
    let raf = null;

    function loop(now) {
      const dt = Math.min(60, now - last);
      last = now;
      if (!reduce) {
        spawnAcc += dt;
        while (spawnAcc > 280) {
          spawnAcc -= 260;
          spawnParticle();
        }
        ctx.clearRect(0, 0, RW, RH);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i]; p.t += dt;
          if (p.phase === 1) {
            const u = Math.min(1, p.t / p.dur1);
            const cx = (p.p0.x + p.p1.x) / 2 + 20;
            const cy = p.p0.y;
            const x = bezier3(u, p.p0.x, cx, cx, p.p1.x);
            const y = bezier3(u, p.p0.y, cy, p.p1.y, p.p1.y);
            for (let k = 0; k < 5; k++) {
              const tu = Math.max(0, u - k * 0.06);
              const tx = bezier3(tu, p.p0.x, cx, cx, p.p1.x);
              const ty = bezier3(tu, p.p0.y, cy, p.p1.y, p.p1.y);
              ctx.fillStyle = hexA(p.colorIn, (1 - k/5) * 0.45);
              ctx.beginPath(); ctx.arc(tx, ty, p.size * (1 - k * 0.16), 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = hexA(p.colorIn, 0.95);
            ctx.shadowBlur = 8; ctx.shadowColor = p.colorIn;
            ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            if (u >= 1) {
              p.phase = 2; p.t = 0;
              ctx.fillStyle = hexA('#E8B564', 0.45);
              ctx.beginPath(); ctx.arc(p.p1.x, p.p1.y, 14, 0, Math.PI * 2); ctx.fill();
            }
          } else {
            const u = Math.min(1, p.t / p.dur2);
            const cx = (p.p1.x + p.p2.x) / 2 - 20;
            const cy = p.p1.y;
            const x = bezier3(u, p.p1.x, cx, cx, p.p2.x);
            const y = bezier3(u, p.p1.y, cy, p.p2.y, p.p2.y);
            for (let k = 0; k < 5; k++) {
              const tu = Math.max(0, u - k * 0.06);
              const tx = bezier3(tu, p.p1.x, cx, cx, p.p2.x);
              const ty = bezier3(tu, p.p1.y, cy, p.p2.y, p.p2.y);
              ctx.fillStyle = hexA(p.colorOut, (1 - k/5) * 0.5);
              ctx.beginPath(); ctx.arc(tx, ty, p.size * (1 - k * 0.16), 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = hexA(p.colorOut, 1);
            ctx.shadowBlur = 10; ctx.shadowColor = p.colorOut;
            ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            if (u >= 1) {
              ctx.fillStyle = hexA(p.colorOut, 0.35);
              ctx.beginPath(); ctx.arc(x, y, p.size * 5, 0, Math.PI * 2); ctx.fill();
              p.outEl.classList.remove('flash');
              void p.outEl.offsetWidth;
              p.outEl.classList.add('flash');
              if (Math.random() < 0.6 && window.__meridianHeroTick) {
                window.__meridianHeroTick(0.10 + Math.random() * 2.4);
              }
              particles.splice(i, 1);
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(loop);
    }

    drawConnectors();
    const ro = new ResizeObserver(drawConnectors);
    ro.observe(stage);
    window.addEventListener('resize', drawConnectors);
    raf = requestAnimationFrame(loop);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', drawConnectors);
    };
  }, []);

  return (
    <div className="route-stage" ref={stageRef}>
      <svg className="connectors" ref={svgRef} preserveAspectRatio="none" aria-hidden="true"></svg>
      <canvas className="cfx" ref={canvasRef} aria-hidden="true"></canvas>
      <div className="cols">
        <div className="col">
          <span className="col-lbl">INPUTS · BY TEAM</span>
          {ROUTE_INPUTS.map(n => (
            <div
              key={n.id}
              className="input-node"
              data-id={n.id}
              data-color={n.c}
              style={{ '--c': n.c }}
            >
              <span className="ic">{n.tag}</span>
              <span className="nm">{n.name}<small>{n.sub}</small></span>
              <span className="pct">{n.pct}</span>
            </div>
          ))}
        </div>

        <div className="col" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <span className="col-lbl">ROUTER</span>
          <div className="router">
            <div className="ring" aria-hidden="true"></div>
            <div className="lbl">smart-route</div>
            <div className="sub">policy v3.2</div>
            <div className="router-meta">
              <div className="row"><span className="pdot" aria-hidden="true"></span>22.1k <b>req/min</b></div>
              <div className="row"><b>38%</b> cached</div>
              <div className="row"><b className="tnum" style={{ color: 'var(--good)' }}>−$14.2k</b> saved 30d</div>
            </div>
          </div>
        </div>

        <div className="col">
          <span className="col-lbl">MODELS · ROUTED TO</span>
          {ROUTE_MODELS.map(n => (
            <div
              key={n.id}
              className="model-node"
              data-id={n.id}
              data-color={n.c}
              style={{ '--c': n.c }}
            >
              <span className="ic">{n.tag}</span>
              <span className="nm">{n.name}<small>{n.sub}</small></span>
              <span className="pct">{n.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SAMPLE_REQS = [
  { model: 'o1-preview',         team: 'Research',    tokens: '42,180', lat: '3.2s',  cost: 5.20, c: 'var(--oa)', tag: 'o1' },
  { model: 'claude-3.5-sonnet',  team: 'Engineering', tokens: '28,400', lat: '1.4s',  cost: 3.82, c: 'var(--an)', tag: '3.5' },
  { model: 'gpt-4o',             team: 'Engineering', tokens: '19,200', lat: '680ms', cost: 2.14, c: 'var(--oa)', tag: '4o' },
  { model: 'gemini-1.5-pro',     team: 'Research',    tokens: '35,600', lat: '880ms', cost: 1.92, c: 'var(--go)', tag: 'G1' },
  { model: 'claude-3.5-sonnet',  team: 'Engineering', tokens: '22,100', lat: '1.1s',  cost: 1.84, c: 'var(--an)', tag: '3.5' },
  { model: 'gpt-4o',             team: 'Product',     tokens: '14,800', lat: '720ms', cost: 1.40, c: 'var(--oa)', tag: '4o' },
  { model: 'claude-opus',        team: 'Research',    tokens: '12,300', lat: '2.4s',  cost: 1.32, c: 'var(--an-2)', tag: 'OP' },
  { model: 'gemini-1.5-pro',     team: 'Engineering', tokens: '18,400', lat: '560ms', cost: 1.05, c: 'var(--go)', tag: 'G1' },
];

function ExpensiveRequests() {
  const [rows, setRows] = React.useState(() =>
    SAMPLE_REQS.slice(0, 8).map((r, i) => ({
      ...r,
      reqId: 'req_' + Math.random().toString(36).slice(2, 9),
      when: (i * 12 + 5) + 's',
      key: 'init-' + i,
      fresh: false,
    }))
  );

  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => {
      const r = SAMPLE_REQS[Math.floor(Math.random() * SAMPLE_REQS.length)];
      const cost = Math.max(1.0, +(r.cost * (0.7 + Math.random() * 0.7)).toFixed(2));
      const next = {
        ...r, cost,
        reqId: 'req_' + Math.random().toString(36).slice(2, 9),
        when: 'now',
        key: 'live-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        fresh: true,
      };
      setRows(prev => [next, ...prev].slice(0, 8));
    }, 4200);
    return () => clearInterval(id);
  }, []);

  function openRow(r) {
    if (window.MeridianUI) {
      window.MeridianUI.navigate('logs');
      window.MeridianUI.toast('Inspecting ' + r.reqId, 'info');
    }
  }

  return (
    <>
      <div className="ex-list">
        {rows.map(r => (
          <div
            key={r.key}
            className={`ex-row${r.fresh ? ' fresh' : ''}`}
            style={{ '--c': r.c }}
            role="button"
            tabIndex={0}
            onClick={() => openRow(r)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(r); } }}
          >
            <span className="badge">{r.tag}</span>
            <div className="ttl">
              <div className="mdl">{r.model}</div>
              <div className="meta">
                {r.reqId}<span className="sep">·</span>{r.team}<span className="sep">·</span>{r.tokens} tok<span className="sep">·</span>{r.lat}
              </div>
            </div>
            <div className="cost">${r.cost.toFixed(2)}</div>
            <div className="when">{r.when}</div>
          </div>
        ))}
      </div>
      <div className="ex-foot">
        <span>147 requests over $1.00 today</span>
        <button type="button" className="ex-foot-link" onClick={() => window.MeridianUI && window.MeridianUI.navigate('logs')}>View all →</button>
      </div>
    </>
  );
}

/* ─────────── Spend flow stacked bars (driven by MODELS data) ─────────── */
function SpendFlowSection({ data }) {
  // Group MODELS by provider family, compute totals and shares.
  const groups = React.useMemo(() => {
    const buckets = { openai: [], anthropic: [], google: [], other: [] };
    (data.models || []).forEach(m => buckets[familyToProvider(m.family)].push(m));
    const provTotals = Object.entries(buckets).map(([prov, models]) => ({
      prov,
      label: prov === 'openai' ? 'OpenAI'
           : prov === 'anthropic' ? 'Anthropic'
           : prov === 'google' ? 'Google' : 'Other',
      color: PROVIDER_COLOR[prov].c,
      models: models.sort((a, b) => b.spend - a.spend),
      total: models.reduce((s, m) => s + m.spend, 0),
    })).filter(g => g.total > 0);

    const grand = provTotals.reduce((s, g) => s + g.total, 0) || 1;
    return provTotals.map(g => ({ ...g, share: g.total / grand }));
  }, [data.models]);

  return (
    <section className="card-r flow-r">
      <header className="flow-head-r">
        <div className="l">
          <h3>Spend flow · by model</h3>
          <span className="sub">May 2026 · MTD</span>
        </div>
        <div className="r">
          {groups.map(g => (
            <span key={g.prov} className="leg" style={{ '--c': g.color }}>
              <span className="ind"></span>{g.label} <b>{data.fmtMoney(g.total)}</b>
            </span>
          ))}
        </div>
      </header>
      <div className="pgroup">
        {groups.map((g, gi) => (
          <div key={g.prov} className="prow" style={{ '--c': g.color }}>
            <div className="pname">
              <span className="ind"></span>
              {g.label}
              <span className="pct">{Math.round(g.share * 100)}%</span>
            </div>
            <div className="pbar">
              {g.models.map((m, mi) => {
                const pct = m.spend / g.total * 100;
                return (
                  <div
                    key={m.id}
                    className="pseg"
                    title={`${m.name} · ${data.fmtMoney(m.spend)}`}
                    style={{ flex: `0 0 ${pct}%`, '--sd': (gi * 0.6 + mi * 0.5) + 's' }}
                  >
                    {m.short || m.name} · {data.fmtMoney(m.spend)}
                  </div>
                );
              })}
            </div>
            <div className="ptotal">{data.fmtMoney(g.total)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamsAndProviders({ data }) {
  // provider mix totals re-used from grouping
  const teams = data.teams || [];
  const totalSpend = teams.reduce((s, t) => s + (t.spend || 0), 0) || 1;

  // group spend by provider (for the right-side mix)
  const provTotals = React.useMemo(() => {
    const buckets = { openai: 0, anthropic: 0, google: 0, other: 0 };
    (data.models || []).forEach(m => { buckets[familyToProvider(m.family)] += m.spend || 0; });
    const grand = Object.values(buckets).reduce((s, v) => s + v, 0) || 1;
    return [
      { prov: 'openai',    label: 'OpenAI',    amt: buckets.openai,    pct: buckets.openai/grand },
      { prov: 'anthropic', label: 'Anthropic', amt: buckets.anthropic, pct: buckets.anthropic/grand },
      { prov: 'google',    label: 'Google',    amt: buckets.google,    pct: buckets.google/grand },
      { prov: 'other',     label: 'Other',     amt: buckets.other,     pct: buckets.other/grand },
    ];
  }, [data.models]);

  return (
    <section className="grid2-r">
      <article className="panel-r">
        <header className="card-head">
          <div className="l">
            <h3>Team budgets</h3>
            <span className="sub">May · cap {data.fmtMoney(data.budgetCap)}</span>
          </div>
          <div className="r"><span className="chip">{teams.length} teams</span></div>
        </header>
        <div className="panel-body">
          <div className="teams-r">
            {teams.map((t, i) => {
              const pct = (t.spend || 0) / (t.budget || 1) * 100;
              const over = pct > 100;
              const meterC1 = ['#6B9080', '#7C8AAA', '#C28A6A', '#D6A687', '#8AAB99'][i % 5];
              const meterC2 = ['#8AAB99', '#9AA6BF', '#D6A687', '#E1BCA0', '#A4C5B3'][i % 5];
              return (
                <article key={t.id} className={`team-r${over ? ' over' : ''}`}>
                  <div className="nm">{t.name}</div>
                  <div className="num">
                    <b className="tnum">{data.fmtMoney(t.spend)}</b> / {data.fmtMoney(t.budget)}
                  </div>
                  <div className="meter-row">
                    <div
                      className={`meter${over ? ' over' : ''}`}
                      style={{ '--w': Math.min(100, pct) + '%', '--c1': meterC1, '--c2': meterC2 }}
                    ></div>
                    <span className="pct tnum">{Math.round(pct)}%</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </article>

      <article className="panel-r">
        <header className="card-head">
          <div className="l">
            <h3>Provider mix</h3>
            <span className="sub tnum">{data.fmtMoney(data.totalSpendUsd)} MTD</span>
          </div>
          <div className="r"><span className="chip">{provTotals.length} providers</span></div>
        </header>
        <div className="panel-body">
          <div className="pmix-r">
            {provTotals.map((p, i) => (
              <div
                key={p.prov}
                className="pmrow"
                style={{ '--c': PROVIDER_COLOR[p.prov].c, '--sd': (i * 0.7) + 's' }}
              >
                <div className="pn"><span className="ind"></span>{p.label}</div>
                <div className="pbar2" style={{ '--w': (p.pct * 100) + '%' }}></div>
                <div className="am">{data.fmtMoney(p.amt)}</div>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}

function FooterBar() {
  return (
    <footer className="fbar">
      <div className="lhs">
        <span>MERIDIAN <b>v0.18.4</b></span>
        <span>BUILD <b>a3c9f1</b></span>
        <span>PROXY <b>healthy · 4ms p50</b></span>
      </div>
      <div>
        <kbd>⌘K</kbd> command <kbd>⌘B</kbd> sidebar <kbd>⌥R</kbd> replay
      </div>
    </footer>
  );
}

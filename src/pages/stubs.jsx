// Stub placeholder pages for new sidebar destinations not yet built out.
// Routes to: models, routing, teams, cache, billing, integrations, settings.

const STUB_CONFIG = {
  models: {
    eyebrow: 'Workspace',
    title: 'Models',
    sub: 'Per-model spend, latency, and routing share',
    body: 'Detailed breakdown of every routed model — spend, p50/p99 latency, share, error rate. For now see the Spend flow section on Overview.',
    cta: { label: 'View on Overview', page: 'overview' },
  },
  routing: {
    eyebrow: 'Workspace',
    title: 'Routing rules',
    sub: 'Smart-route policies and overrides',
    body: 'Define routing policies: prompt-shape rules, team allowlists, per-team cost ceilings, fallback chains. Currently policies live in `data.jsx` — visual editor coming.',
  },
  teams: {
    eyebrow: 'Workspace',
    title: 'Teams',
    sub: 'Per-team budgets, members, and routing',
    body: 'Team-level spend dashboards, member rosters, budget alerts, and per-team routing overrides. Spend totals per team are visible on Overview.',
    cta: { label: 'View team budgets', page: 'overview' },
  },
  cache: {
    eyebrow: 'Workspace',
    title: 'Cache',
    sub: 'Hit rate, savings, and eviction policy',
    body: 'Inspect cache performance: hit rate, savings vs no-cache baseline, top cached prompts, eviction policy, TTL distribution. Currently 38.2% hit rate (saving ~$4.1k/mo).',
  },
  billing: {
    eyebrow: 'Operations',
    title: 'Billing',
    sub: 'Invoices, plans, payment methods',
    body: 'Stripe-backed billing with invoice history, plan switching, seat counts, and overage line items. Connected to a live billing service in production builds.',
  },
  integrations: {
    eyebrow: 'Operations',
    title: 'Integrations',
    sub: 'Slack, PagerDuty, webhooks, SSO',
    body: 'Wire alerts and routing events to your tools. Slack channels for budget warnings, PagerDuty for anomalies, generic webhooks for everything else, SSO for the dashboard itself.',
  },
  settings: {
    eyebrow: 'Operations',
    title: 'Settings',
    sub: 'Account, workspace, preferences',
    body: 'Workspace name, time zone, notification preferences, dark/light theme (dark only for now), keyboard shortcuts, danger zone.',
  },
};

function PageStub({ page }) {
  const cfg = STUB_CONFIG[page] || STUB_CONFIG.settings;

  return (
    <div className="overview-r">
      <header className="pghead">
        <div className="pghead-l">
          <h1>{cfg.title}</h1>
          <span className="crumb"><a href="#">{cfg.eyebrow}</a> <span>·</span> {cfg.title}</span>
        </div>
        <div className="pghead-r">
          <span className="liveind"><span className="pdot" aria-hidden="true"></span>proxy us-east-1 · 4ms p50</span>
        </div>
      </header>

      <article className="card-r" style={{ padding: '40px 32px', display: 'grid', placeItems: 'start', gap: 16, maxWidth: 720 }}>
        <span className="chip">Stub · in progress</span>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          {cfg.sub}
        </h2>
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.65, color: 'var(--text-dim)', maxWidth: '60ch' }}>
          {cfg.body}
        </p>
        {cfg.cta ? (
          <button
            type="button"
            className="cta-r"
            onClick={() => window.dispatchEvent(new CustomEvent('meridian:nav', { detail: cfg.cta.page }))}
          >
            {cfg.cta.label} <span className="arrow" aria-hidden="true">→</span>
          </button>
        ) : null}
      </article>
    </div>
  );
}

window.PageStub = PageStub;

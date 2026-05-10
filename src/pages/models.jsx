// Models — read-only catalogue from /api/models (server reads pricing.TABLE).
// In demo mode, falls back to MERIDIAN.MODELS.

const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', mistral: 'Mistral' };
const PROVIDER_HEX = {
  openai:    '#3FB37F',  // emerald
  anthropic: '#E8A04A',  // golden amber
  google:    '#7079E8',  // electric indigo
  mistral:   '#8B8987',  // warm gray
};

function PageModels() {
  const fallback = (window.MERIDIAN && window.MERIDIAN.MODELS) || [];
  const { items, error, refresh } = window.MeridianAPI.useList(
    () => window.MeridianAPI.models.list(),
    { models: fallback.map(m => ({
        provider: m.family || 'openai',
        model: m.id,
        input: 0, output: 0,
        inputPer1k: m.costPer1K || 0, outputPer1k: m.costPer1K || 0,
      })),
      count: fallback.length,
    }
  );

  if (error) {
    return (
      <div className="overview-r">
        <PageHead title="Models" />
        <div className="card-r" style={{ padding: 20, color: 'var(--red)' }}>
          {error.message}
          <button onClick={refresh} className="ghost-r" style={{ marginLeft: 12 }}>Retry</button>
        </div>
      </div>
    );
  }
  if (!items) return <div className="meridian-loading" style={{ padding: 24 }}>Loading…</div>;

  // Group rows by provider
  const grouped = {};
  (items.models || []).forEach(m => {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m);
  });
  const providers = Object.keys(grouped).sort();

  return (
    <div className="overview-r">
      <PageHead title="Models" eyebrow="Workspace" right={
        <span className="chip">{items.count} models · {providers.length} providers</span>
      } />

      <article className="card-r" style={{ padding: 0 }}>
        <header className="card-head">
          <div className="l">
            <h3>Pricing &amp; routing catalogue</h3>
            <span className="sub">USD per 1k tokens · pulled from server pricing table</span>
          </div>
          <div className="r">
            <button type="button" className="ghost-r" onClick={refresh}>Refresh</button>
          </div>
        </header>

        <div style={{ overflowX: 'auto' }}>
          <table className="models-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Provider</th>
                <th>Model</th>
                <th style={{ textAlign: 'right' }}>Input / 1k</th>
                <th style={{ textAlign: 'right' }}>Output / 1k</th>
                <th style={{ textAlign: 'right' }}>Output / Input</th>
                <th style={{ textAlign: 'right', paddingRight: 22 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(prov => grouped[prov].map((m, i) => {
                const ratio = m.inputPer1k > 0 ? (m.outputPer1k / m.inputPer1k).toFixed(1) + '×' : '—';
                const isFirstInGroup = i === 0;
                return (
                  <tr key={`${prov}-${m.model}`} className={isFirstInGroup ? 'group-start' : ''}>
                    <td style={{ paddingLeft: 22 }}>
                      {isFirstInGroup ? (
                        <span className="prov-badge" style={{ '--c': PROVIDER_HEX[prov] || '#8B8987' }}>
                          <span className="ind"></span>{PROVIDER_LABEL[prov] || prov}
                        </span>
                      ) : null}
                    </td>
                    <td className="mono-cell">{m.model}</td>
                    <td className="mono-cell" style={{ textAlign: 'right' }}>${m.inputPer1k.toFixed(4)}</td>
                    <td className="mono-cell" style={{ textAlign: 'right' }}>${m.outputPer1k.toFixed(4)}</td>
                    <td className="mono-cell" style={{ textAlign: 'right', color: 'var(--text-mute)' }}>{ratio}</td>
                    <td style={{ textAlign: 'right', paddingRight: 22 }}>
                      <span className="chip"><span className="dot"></span>available</span>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        <div className="ex-foot">
          <span>{items.count} models across {providers.length} providers</span>
          <span style={{ color: 'var(--text-mute)' }}>
            Smart-route picks the cheapest model per request that meets quality thresholds.
          </span>
        </div>
      </article>
    </div>
  );
}

// Tiny shared page-header component reused by Models + future pages
function PageHead({ title, eyebrow, right }) {
  return (
    <header className="pghead">
      <div className="pghead-l">
        <h1>{title}</h1>
        {eyebrow ? (
          <span className="crumb">
            <a href="#">{eyebrow}</a> <span>·</span> {title}
          </span>
        ) : null}
      </div>
      <div className="pghead-r">
        <span className="liveind"><span className="pdot" aria-hidden="true"></span>proxy us-east-1 · 4ms p50</span>
        {right}
      </div>
    </header>
  );
}

window.PageModels = PageModels;
window.PageHead = PageHead;  // shared

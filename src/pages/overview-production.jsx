// Overview — Linear × Bloomberg terminal layout (12-col grid + anomaly rail).

function useOverviewData() {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!window.MeridianAPI || !window.MeridianAPI.live) {
      const M = window.MERIDIAN;
      setData({
        totalSpendUsd: M.KPI.totalSpend,
        totalRequests: M.KPI.totalCalls,
        budgetCap: M.KPI.budgetCap,
        projectedEOM: M.KPI.projectedEOM,
        savingsUsd: M.KPI.routingSavings,
        teams: M.TEAMS,
        models: M.MODELS,
        fmtMoney: M.fmtMoney,
        fmtNum: M.fmtNum,
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
            totalSpendUsd: d.totalSpendUsd ?? M.KPI.totalSpend,
            savingsUsd: d.savingsUsd ?? M.KPI.routingSavings,
            teams: M.TEAMS,
            models: M.MODELS,
            fmtMoney: M.fmtMoney,
            fmtNum: M.fmtNum,
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
  const C = window.MeridianUIComponents || {};
  const { DrawChart } = window.MeridianMotion || {};
  const M = window.MERIDIAN;
  const UI = window.MeridianUI;
  const [chartRange, setChartRange] = React.useState('daily');
  const [modelFilter, setModelFilter] = React.useState('all');

  React.useEffect(() => {
    const fn = (e) => { if (e.detail) setModelFilter(e.detail); };
    window.addEventListener('meridian:model-filter', fn);
    return () => window.removeEventListener('meridian:model-filter', fn);
  }, []);

  const Body = C.PageBody || (p => <div className="m-page p-4">{p.children}</div>);

  if (error) {
    return (
      <Body>
        <p className="text-critical text-sm">{error.message}</p>
      </Body>
    );
  }

  if (!data) {
    return (
      <Body>
        <div className="m-stagger m-bento">
          <C.KpiCard loading />
          <C.KpiCard loading />
          <C.KpiCard loading />
          <C.KpiCard loading />
          <C.ChartCard loading span="col-span-12" title="Spend by model" />
        </div>
      </Body>
    );
  }

  const sparks = M.KPI_SPARKS || {};
  const deltas = M.KPI_DELTAS || {};
  const stacked = (M.SPEND_STACKED && M.SPEND_STACKED[chartRange]) || { labels: [], series: [] };
  const anomalies = M.ANOMALIES || [];
  const tokensDisplay = 18.4;
  const costPerReq = data.totalRequests ? data.totalSpendUsd / data.totalRequests : 0.0296;
  const activeModels = (data.models || M.MODELS || []).filter(m => m.status !== 'paused').length;

  const tableRows = (data.models || M.MODELS || []).map((m, i) => {
    const inTok = Math.round(m.callsMonth * 0.72);
    const outTok = Math.round(m.callsMonth * 0.28);
    const efficiency = Math.round(100 - (m.costPer1K || 0.003) * 8000 + i * 4);
    return {
      id: m.id,
      name: m.name,
      provider: m.family,
      requests: m.callsMonth,
      inTok,
      outTok,
      cost: m.spend,
      latency: m.latency,
      efficiency: Math.min(98, Math.max(22, efficiency)),
      endpoints: [
        { path: '/v1/chat/completions', cost: m.spend * 0.62, requests: Math.round(m.callsMonth * 0.55) },
        { path: '/v1/embeddings', cost: m.spend * 0.22, requests: Math.round(m.callsMonth * 0.28) },
        { path: '/v1/batch', cost: m.spend * 0.16, requests: Math.round(m.callsMonth * 0.17) },
      ],
    };
  });

  const filteredChart = modelFilter === 'all'
    ? stacked
    : {
        ...stacked,
        series: stacked.series.filter(s => s.id === modelFilter || s.name.toLowerCase().includes(modelFilter)),
      };

  return (
    <Body className="!max-w-none">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="m-stagger m-bento" aria-label="Key metrics">
            <C.KpiCard
              label="Total spend"
              value={data.totalSpendUsd}
              format={v => data.fmtMoney(Math.round(v))}
              tone="accent"
              spark={sparks.spend}
              deltaPct={deltas.spend?.pct}
              deltaUp={deltas.spend?.up}
              sub="MTD · all providers"
            />
            <C.KpiCard
              label="Tokens used"
              value={tokensDisplay}
              format={v => v.toFixed(1) + 'B'}
              tone="cyan"
              spark={sparks.tokens}
              deltaPct={deltas.tokens?.pct}
              deltaUp={deltas.tokens?.up}
              sub="Input + output · 30d"
            />
            <C.KpiCard
              label="Cost per request"
              value={costPerReq * 1000}
              format={v => '$' + (v / 1000).toFixed(4)}
              spark={sparks.cpr}
              deltaPct={deltas.cpr?.pct}
              deltaUp={!deltas.cpr?.up}
              sub="Blended · routed calls"
            />
            <C.KpiCard
              label="Active models"
              value={activeModels}
              format={v => String(Math.round(v))}
              spark={sparks.models}
              deltaPct={deltas.models?.pct}
              deltaUp={deltas.models?.up}
              sub="Across 3 providers"
            />
          </section>

          <section className="m-stagger" style={{ animationDelay: '120ms' }}>
            <C.ChartCard
              title="Spend over time"
              subtitle="Stacked by model · gradient areas"
              span="col-span-12"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {C.TabGroup ? (
                    <C.TabGroup
                      tabs={[
                        { id: 'daily', label: 'Daily' },
                        { id: 'weekly', label: 'Weekly' },
                        { id: 'monthly', label: 'Monthly' },
                      ]}
                      value={chartRange}
                      onChange={setChartRange}
                    />
                  ) : null}
                  <button type="button" className="m-btn-ghost text-xs" onClick={() => UI && UI.navigate('routing')}>
                    Smart router →
                  </button>
                </div>
              }
            >
              <div className="mb-4 flex flex-wrap gap-3">
                {filteredChart.series.map(s => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 text-xs text-txt-secondary">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
              {DrawChart && window.StackedAreaChart ? (
                <DrawChart>
                  <StackedAreaChart series={filteredChart.series} labels={filteredChart.labels} height={220} />
                </DrawChart>
              ) : window.StackedAreaChart ? (
                <StackedAreaChart series={filteredChart.series} labels={filteredChart.labels} height={220} />
              ) : null}
            </C.ChartCard>
          </section>

          <section className="m-stagger" style={{ animationDelay: '180ms' }}>
            <article className="m-card m-card-hover col-span-12 overflow-hidden">
              <header className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" style={{ borderColor: 'var(--m-hairline)' }}>
                <div>
                  <h3 className="text-title-2 font-semibold text-txt-primary">Model breakdown</h3>
                  <p className="text-xs text-txt-muted">Sortable · expand row for endpoints</p>
                </div>
                <button type="button" className="m-btn-ghost text-xs" onClick={() => UI && UI.navigate('models')}>
                  All models →
                </button>
              </header>
              {C.ModelTable ? (
                <C.ModelTable
                  rows={tableRows}
                  fmtMoney={data.fmtMoney}
                  fmtNum={data.fmtNum}
                  onRowAction={p => UI && UI.navigate(p)}
                />
              ) : null}
            </article>
          </section>

          {data.savingsUsd ? (
            <div className="m-card flex flex-wrap items-center justify-between gap-3 border-accent/25 bg-accent/5 p-4">
              <div>
                <p className="m-label text-accent">ML router savings</p>
                <p className="m-mono-num text-lg font-semibold text-txt-primary">
                  {data.fmtMoney(data.savingsUsd)} saved vs gpt-4-only baseline
                </p>
              </div>
              <button type="button" className="m-btn-primary" onClick={() => UI && UI.navigate('routing')}>
                View routing rules
              </button>
            </div>
          ) : null}
        </div>

        <aside
          className="m-card m-card-hover flex max-h-[calc(100vh-8rem)] w-full shrink-0 flex-col overflow-hidden xl:sticky xl:top-4 xl:w-[320px] animate-slide-in-right"
          aria-label="Cost anomalies"
        >
          <header className="border-b px-4 py-4" style={{ borderColor: 'var(--m-hairline)' }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-txt-primary">Cost anomalies</h3>
              <C.StatusPill tone="critical">{anomalies.length} flagged</C.StatusPill>
            </div>
            <p className="mt-1 text-xs text-txt-muted">AI explanations · live feed</p>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {C.AnomalyFeed ? (
              <C.AnomalyFeed
                items={anomalies}
                fmtMoney={data.fmtMoney}
                onInvestigate={() => UI && UI.investigate && UI.investigate()}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </Body>
  );
}

window.PageOverview = PageOverview;

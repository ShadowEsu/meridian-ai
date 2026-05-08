'use strict';
const { requireUser } = require('../auth-middleware');
const { TABLE } = require('../services/pricing');

function startOfMonthIso(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return d.toISOString();
}

function nDaysAgoIso(n, now = new Date()) {
  const d = new Date(now.getTime() - n * 24 * 3600 * 1000);
  return d.toISOString();
}

function nMinutesAgoIso(n, now = new Date()) {
  return new Date(now.getTime() - n * 60_000).toISOString();
}

function dayKey(iso) { return iso.slice(0, 10); }

/**
 * Returns the entry from the pricing TABLE for the provider that has the
 * highest average of (input + output) / 2 — i.e. the most expensive model.
 * Used to compute the "always premium" baseline spend.
 *
 * @param {string} provider - e.g. 'openai'
 * @returns {{ model: string, ratio: number, prices: { input: number, output: number } } | null}
 */
function premiumModelFor(provider) {
  const models = TABLE[provider] || {};
  let max = null;
  for (const [model, p] of Object.entries(models)) {
    const ratio = (p.input + p.output) / 2;
    if (!max || ratio > max.ratio) max = { model, ratio, prices: p };
  }
  return max;
}

/**
 * Register KPI aggregation endpoints.
 *
 * @param {import('express').Application} app
 * @param {{ store: object }} ctx
 */
function register(app, { store }) {
  /**
   * GET /api/kpi/overview
   * Returns MTD totals, 30-day daily spend series, spend-by-team,
   * model mix, and estimated savings vs always-premium baseline.
   */
  app.get('/api/kpi/overview', requireUser, async (req, res) => {
    const userId = req.user.id;
    const monthStart = startOfMonthIso();
    const since30    = nDaysAgoIso(30);

    const [{ rows: monthly }, { rows: daily30 }] = await Promise.all([
      store.requests.query({ userId, from: monthStart, page: 1, limit: 100000 }),
      store.requests.query({ userId, from: since30,    page: 1, limit: 100000 }),
    ]);

    let totalSpend = 0;
    let promptTok = 0;
    let completionTok = 0;
    let baseline = 0;
    const byModel = new Map();
    const byTeam  = new Map();

    for (const r of monthly) {
      totalSpend      += r.costUsd        || 0;
      promptTok       += r.promptTokens   || 0;
      completionTok   += r.completionTokens || 0;

      byModel.set(r.model, (byModel.get(r.model) || 0) + (r.costUsd || 0));
      byTeam.set(r.teamId || 0, (byTeam.get(r.teamId || 0) || 0) + (r.costUsd || 0));

      const top = premiumModelFor(r.provider);
      if (top) {
        baseline += ((r.promptTokens || 0) * top.prices.input + (r.completionTokens || 0) * top.prices.output) / 1_000_000;
      }
    }

    // Build 30-day series oldest-first.
    const dailyMap = new Map();
    for (const r of daily30) {
      const k = dayKey(r.timestamp);
      dailyMap.set(k, (dailyMap.get(k) || 0) + (r.costUsd || 0));
    }
    const dailySpend = [];
    for (let i = 29; i >= 0; i--) {
      const k = dayKey(nDaysAgoIso(i));
      dailySpend.push({ date: k, costUsd: Number((dailyMap.get(k) || 0).toFixed(6)) });
    }

    // One entry per team the user has, even if zero spend.
    const teams = await store.teams.list(userId);
    const teamSpend = teams.map(t => ({
      teamId: t.id,
      name: t.name,
      monthlyBudgetUsd: t.monthlyBudgetUsd,
      spentUsd: Number((byTeam.get(t.id) || 0).toFixed(6)),
    }));

    // Model mix sorted desc by spend.
    const modelMix = [...byModel.entries()]
      .map(([model, costUsd]) => ({ model, costUsd: Number(costUsd.toFixed(6)) }))
      .sort((a, b) => b.costUsd - a.costUsd);

    res.json({
      totalSpendUsd:          Number(totalSpend.toFixed(6)),
      totalRequests:          monthly.length,
      totalPromptTokens:      promptTok,
      totalCompletionTokens:  completionTok,
      estimatedSavingsUsd:    Math.max(0, Number((baseline - totalSpend).toFixed(6))),
      baselineSpendUsd:       Number(baseline.toFixed(6)),
      dailySpend,
      teamSpend,
      modelMix,
    });
  });

  /**
   * GET /api/kpi/feed
   * Returns RPM (last 5 min), TPS (last 60 s), $/hour (last 60 min),
   * and the 50 most recent requests.
   */
  app.get('/api/kpi/feed', requireUser, async (req, res) => {
    const userId = req.user.id;

    const [last5min, last1min, last1hour] = await Promise.all([
      store.requests.query({ userId, from: nMinutesAgoIso(5),  page: 1, limit: 100000 }),
      store.requests.query({ userId, from: nMinutesAgoIso(1),  page: 1, limit: 100000 }),
      store.requests.query({ userId, from: nMinutesAgoIso(60), page: 1, limit: 100000 }),
    ]);

    const tokensLast60s  = last1min.rows.reduce((s, r) => s + (r.promptTokens || 0) + (r.completionTokens || 0), 0);
    const costLast60min  = last1hour.rows.reduce((s, r) => s + (r.costUsd || 0), 0);

    res.json({
      requestsPerMinute: Number((last5min.rows.length / 5).toFixed(2)),
      tokensPerSecond:   Number((tokensLast60s / 60).toFixed(2)),
      costPerHourUsd:    Number(costLast60min.toFixed(6)),
      recent:            last5min.rows.slice(0, 50),   // newest first per query()
    });
  });
}

module.exports = { register };

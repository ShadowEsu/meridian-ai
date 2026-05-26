'use strict';

// Router preview endpoint — shows what the manual router would pick for
// a given prompt + constraints. Public read-only; no storage.
//
// The actual routing decision happens in proxy.js (when implemented end-to-end).
// This endpoint exists so the UI can show "if you sent this prompt, we'd
// route it to X" without actually firing a billable provider call.

const { z } = require('zod');
const { validate } = require('../lib/validate');
const { pickModel, classifyPrompt, TASK_DEFAULTS, CATALOG } = require('../services/manual-router');
const { getMlpRouter } = require('../services/mlp-router');

const previewBody = z.object({
  prompt:       z.string().min(1).max(50_000),
  taskTypeHint: z.string().min(1).max(64).optional(),
  constraints:  z.object({
    maxCostPerCallUsd: z.number().nonnegative().max(100).optional(),
    maxLatencyMs:      z.number().int().positive().max(60_000).optional(),
    requireSovereign:  z.boolean().optional(),
    requireGdprEu:     z.boolean().optional(),
    providerAllow:     z.array(z.string()).max(20).optional(),
    providerBlock:     z.array(z.string()).max(20).optional(),
  }).strict().optional(),
}).strict();

function register(app /*, ctx */) {
  // POST /api/router/preview — what would the router pick?
  app.post('/api/router/preview',
    validate(z.object({ body: previewBody })),
    async (req, res) => {
      const { prompt, taskTypeHint, constraints } = req.validated.body;

      // Call the MLP if available; tolerate failure (fall back to JS heuristic).
      let mlp = null;
      const mlpRouter = getMlpRouter();
      if (mlpRouter && mlpRouter.isReady()) {
        try {
          mlp = await mlpRouter.classifyTier(prompt, taskTypeHint);
        } catch (e) {
          mlp = { tier: null, error: String(e.message || e) };
        }
      } else if (mlpRouter) {
        mlp = { tier: null, error: 'mlp not ready', lastError: mlpRouter.lastError() };
      }

      const result = pickModel({
        prompt,
        taskTypeHint,
        constraints,
        mlpTier: mlp && mlp.tier ? mlp.tier : null,
      });
      res.json({
        ...result,
        classifiedAs: classifyPrompt(prompt),
        mlp, // { tier, confidence, probs, elapsedMs } or { tier: null, error }
        catalogEntry: result.catalogEntry ? {
          id: result.catalogEntry.id,
          provider: result.catalogEntry.provider,
          tier: result.catalogEntry.tier,
          contextK: result.catalogEntry.contextK,
          inUsdM: result.catalogEntry.inUsdM,
          outUsdM: result.catalogEntry.outUsdM,
          latencyP50ms: result.catalogEntry.latencyP50ms,
          notes: result.catalogEntry.notes,
        } : null,
      });
    }
  );

  // GET /api/router/mlp/status — health probe for the Python child process
  app.get('/api/router/mlp/status', (_req, res) => {
    const r = getMlpRouter();
    if (!r) return res.json({ enabled: false, ready: false, reason: 'MLP_ROUTER_DISABLE=1' });
    res.json({ enabled: true, ready: r.isReady(), lastError: r.lastError() });
  });

  // GET /api/router/catalog — full model catalogue used by the router
  app.get('/api/router/catalog', (_req, res) => {
    res.json({
      models: CATALOG.map(m => ({
        id: m.id, provider: m.provider, tier: m.tier, family: m.family,
        contextK: m.contextK, maxOutK: m.maxOutK,
        inUsdM: m.inUsdM, outUsdM: m.outUsdM, latencyP50ms: m.latencyP50ms,
        bestFor: m.bestFor, avoidFor: m.avoidFor,
        notes: m.notes, sovereign: m.sovereign, modalities: m.modalities,
      })),
      taskDefaults: TASK_DEFAULTS,
      total: CATALOG.length,
    });
  });
}

module.exports = { register };

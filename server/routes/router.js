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
    (req, res) => {
      const { prompt, taskTypeHint, constraints } = req.validated.body;
      const result = pickModel({ prompt, taskTypeHint, constraints });
      // Include enough context for the UI to show the why
      res.json({
        ...result,
        classifiedAs: classifyPrompt(prompt),
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

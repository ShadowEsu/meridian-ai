'use strict';

// Read-only model catalogue. Sourced from the static pricing TABLE in
// services/pricing.js — no storage, no auth required (this is public info
// the user already needs to see when picking which models to enable).

const { listModels } = require('../services/pricing');

function register(app /*, ctx */) {
  app.get('/api/models', (_req, res) => {
    const models = listModels().map(m => ({
      ...m,
      // pricing.js stores USD per 1M tokens; UI uses USD per 1k for readability
      inputPer1k:  +(m.input  / 1000).toFixed(6),
      outputPer1k: +(m.output / 1000).toFixed(6),
      // best-guess family for color-grouping (matches PROVIDER_COLOR map on UI)
      family: m.provider,
    }));
    res.json({ models, count: models.length });
  });
}

module.exports = { register };

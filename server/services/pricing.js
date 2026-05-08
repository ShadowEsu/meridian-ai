'use strict';

// USD per 1M tokens.
const TABLE = {
  anthropic: {
    'claude-opus-4-7':   { input: 15.00, output: 75.00 },
    'claude-sonnet-4-6': { input:  3.00, output: 15.00 },
    'claude-haiku-4-5':  { input:  1.00, output:  5.00 },
  },
  openai: {
    'gpt-4.1':       { input: 3.00, output: 12.00 },
    'gpt-4.1-mini':  { input: 0.40, output:  1.60 },
    'gpt-4.1-nano':  { input: 0.10, output:  0.40 },
  },
  google: {
    'gemini-2.5-pro':   { input: 1.25, output: 5.00 },
    'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  },
  mistral: {
    'mistral-large-2': { input: 2.00, output: 6.00 },
  },
};

function costFor({ provider, model, promptTokens = 0, completionTokens = 0 }) {
  if (promptTokens < 0 || completionTokens < 0) {
    throw new Error('costFor: tokens must be non-negative');
  }
  const row = TABLE[provider]?.[model];
  if (!row) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[meridian] pricing: unknown ${provider}/${model}; cost=0`);
    }
    return 0;
  }
  return (promptTokens * row.input + completionTokens * row.output) / 1_000_000;
}

function listModels() {
  const out = [];
  for (const [provider, models] of Object.entries(TABLE)) {
    for (const [model, prices] of Object.entries(models)) {
      out.push({ provider, model, ...prices });
    }
  }
  return out;
}

module.exports = { costFor, listModels, TABLE };

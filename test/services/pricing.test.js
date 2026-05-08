'use strict';
const { costFor, listModels } = require('../../server/services/pricing');

describe('pricing.costFor', () => {
  it('computes anthropic claude-haiku-4-5 cost', () => {
    // 1000 input + 2000 output tokens, prices: 1.00 input / 5.00 output per 1M
    const c = costFor({ provider: 'anthropic', model: 'claude-haiku-4-5', promptTokens: 1000, completionTokens: 2000 });
    expect(c).toBeCloseTo((1000 * 1 + 2000 * 5) / 1_000_000, 6);
    // = (1000 + 10000) / 1e6 = 0.011
    expect(c).toBeCloseTo(0.011, 6);
  });

  it('returns 0 and logs for unknown model', () => {
    const c = costFor({ provider: 'anthropic', model: 'made-up', promptTokens: 100, completionTokens: 100 });
    expect(c).toBe(0);
  });

  it('rejects negative tokens', () => {
    expect(() => costFor({ provider: 'anthropic', model: 'claude-haiku-4-5', promptTokens: -1, completionTokens: 0 }))
      .toThrow(/tokens/);
  });

  it('listModels returns at least 9 models', () => {
    expect(listModels().length).toBeGreaterThanOrEqual(9);
  });
});

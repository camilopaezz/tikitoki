import { describe, expect, it } from 'vitest';
import { computeBitrateBudget } from '../../../src/render/bitrate.js';

describe('computeBitrateBudget', () => {
  it('computes total bitrate from target size and duration', () => {
    const budget = computeBitrateBudget(45, 60, 1920, 1080);
    const total = budget.videoBitrate + budget.audioBitrate;
    // 45 MB * 8 / 60s = 6,291,456 bps total
    expect(total).toBeCloseTo(6_291_456, -3);
  });

  it('flags downscale when budget is below quality floor', () => {
    const budget = computeBitrateBudget(45, 600, 3840, 2160);
    expect(budget.needsDownscale).toBe(true);
  });

  it('does not flag downscale for short content', () => {
    const budget = computeBitrateBudget(45, 10, 1920, 1080);
    expect(budget.needsDownscale).toBe(false);
  });
});

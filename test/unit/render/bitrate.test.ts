import { describe, expect, it } from 'vitest';
import { computeBitrateBudget } from '../../../src/render/bitrate.js';

describe('computeBitrateBudget', () => {
  it('uses size budget when under the max video bitrate', () => {
    // 45 MB / 120s ≈ 3.15 Mbps total → under 4 Mbps cap
    const budget = computeBitrateBudget(45, 120, 1920, 1080);
    const total = budget.videoBitrate + budget.audioBitrate;
    expect(total).toBeCloseTo((45 * 1024 * 1024 * 8) / 120, -3);
    expect(budget.hitMaxBitrate).toBe(false);
  });

  it('caps video bitrate so short clips do not fill the size target', () => {
    const budget = computeBitrateBudget(45, 10, 1920, 1080);
    expect(budget.videoBitrate).toBe(4_000_000);
    expect(budget.hitMaxBitrate).toBe(true);
    // Uncapped would be ~36 Mbps; size would be ~45 MB. Cap keeps it small.
    const approxMb = ((budget.videoBitrate + budget.audioBitrate) * 10) / 8 / 1024 / 1024;
    expect(approxMb).toBeLessThan(6);
  });

  it('flags downscale when size budget is below quality floor', () => {
    const budget = computeBitrateBudget(45, 600, 3840, 2160);
    expect(budget.needsDownscale).toBe(true);
  });

  it('does not flag downscale for short content (cap binds instead)', () => {
    const budget = computeBitrateBudget(45, 10, 1920, 1080);
    expect(budget.needsDownscale).toBe(false);
    expect(budget.videoBitrate).toBe(4_000_000);
    expect(budget.hitMaxBitrate).toBe(true);
  });

  it('caps short-clip video bitrate at 4 Mbps', () => {
    const budget = computeBitrateBudget(45, 12.9, 1080, 1224);
    expect(budget.videoBitrate).toBe(4_000_000);
    expect(budget.hitMaxBitrate).toBe(true);
  });

  it('does not downscale short 4K just because the max bitrate is below the floor', () => {
    // Uncapped size budget is huge; only MAX_VIDEO_BITRATE binds.
    const budget = computeBitrateBudget(45, 10, 3840, 2160);
    expect(budget.needsDownscale).toBe(false);
    expect(budget.videoBitrate).toBe(4_000_000);
    expect(budget.hitMaxBitrate).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { computeTiming } from '../../../src/render/timing.js';

describe('computeTiming', () => {
  it('evenly splits audio duration across slides', () => {
    const timing = computeTiming(4, 12, 3);
    expect(timing.perSlide).toBe(3);
    expect(timing.totalDuration).toBe(12);
    expect(timing.addSilentAudio).toBe(false);
  });

  it('uses silent-slide fallback when audio is missing', () => {
    const timing = computeTiming(3, undefined, 3);
    expect(timing.perSlide).toBe(3);
    expect(timing.totalDuration).toBe(9);
    expect(timing.addSilentAudio).toBe(true);
  });

  it('handles a single slide', () => {
    const timing = computeTiming(1, 5, 3);
    expect(timing.perSlide).toBe(5);
    expect(timing.totalDuration).toBe(5);
  });
});

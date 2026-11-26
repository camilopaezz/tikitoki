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

  it('uses silent-slide timing but no silent audio when hasAudio is true', () => {
    const timing = computeTiming(3, undefined, 3, true);
    expect(timing.perSlide).toBe(3);
    expect(timing.totalDuration).toBe(9);
    expect(timing.addSilentAudio).toBe(false);
  });

  it('stretches slides by the crossfade overlap so video length matches audio', () => {
    const timing = computeTiming(10, 30, 3, true, 0.4);
    expect(timing.crossfade).toBe(0.4);
    expect(timing.perSlide).toBeCloseTo(3.36, 9);
    expect(10 * timing.perSlide - 9 * timing.crossfade).toBeCloseTo(30, 9);
    expect(timing.totalDuration).toBe(30);
  });

  it('clamps crossfade to half a slide and still matches audio length', () => {
    const timing = computeTiming(4, 2, 3, true, 0.4);
    expect(timing.crossfade).toBeCloseTo(timing.perSlide / 2, 9);
    expect(4 * timing.perSlide - 3 * timing.crossfade).toBeCloseTo(2, 9);
  });

  it('reports the real (overlapped) length for silent slideshows', () => {
    const timing = computeTiming(3, undefined, 5, false, 0.4);
    expect(timing.perSlide).toBe(5);
    expect(timing.crossfade).toBe(0.4);
    expect(timing.totalDuration).toBeCloseTo(14.2, 9);
  });

  it('handles a single slide', () => {
    const timing = computeTiming(1, 5, 3);
    expect(timing.perSlide).toBe(5);
    expect(timing.totalDuration).toBe(5);
    expect(computeTiming(1, 5, 3, true, 0.4).crossfade).toBe(0);
  });
});

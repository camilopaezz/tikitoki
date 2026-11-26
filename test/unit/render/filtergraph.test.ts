import { describe, expect, it } from 'vitest';
import { buildFiltergraph } from '../../../src/render/filtergraph.js';

describe('buildFiltergraph', () => {
  const canvas = { width: 1080, height: 1920 };
  const timing = { perSlide: 3, crossfade: 0.4, totalDuration: 8.2, addSilentAudio: false };

  it('builds scale+pad filters for each slide', () => {
    const slides = [
      { path: 'a.jpg', width: 1080, height: 1920 },
      { path: 'b.jpg', width: 1080, height: 1920 },
    ];
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing });
    expect(filterComplex).toContain('[0:v]');
    expect(filterComplex).toContain('[1:v]');
    expect(filterComplex).toContain('[out]');
  });

  it('includes xfade for multiple slides', () => {
    const slides = [
      { path: 'a.jpg', width: 1080, height: 1920 },
      { path: 'b.jpg', width: 1080, height: 1920 },
      { path: 'c.jpg', width: 1080, height: 1920 },
    ];
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing });
    expect(filterComplex).toContain('xfade');
    expect(filterComplex).toContain('transition=fade');
  });

  it('does not include xfade for a single slide', () => {
    const slides = [{ path: 'a.jpg', width: 1080, height: 1920 }];
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing });
    expect(filterComplex).not.toContain('xfade');
  });

  it('uses the timing crossfade for xfade duration and offsets', () => {
    const slides = [
      { path: 'a.jpg', width: 1080, height: 1920 },
      { path: 'b.jpg', width: 1080, height: 1920 },
    ];
    const shortTiming = {
      perSlide: 0.5,
      crossfade: 0.25,
      totalDuration: 0.75,
      addSilentAudio: false,
    };
    const { filterComplex, inputDuration } = buildFiltergraph({
      slides,
      canvas,
      timing: shortTiming,
    });
    expect(filterComplex).toContain('duration=0.25:offset=0.25');
    expect(inputDuration).toBe(0.75);
  });

  it('decodes each still once and loops it for the slide duration', () => {
    const slides = [
      { path: 'a.jpg', width: 1080, height: 1920 },
      { path: 'b.jpg', width: 720, height: 1280 },
    ];
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing });
    const perSlide = filterComplex.split(';').filter((p) => p.includes('loop='));
    expect(perSlide).toHaveLength(2);
    for (const part of perSlide) {
      expect(part).toMatch(/pad=[^;]*,loop=loop=-1:size=1:start=0,trim=duration=3\[v\d\]$/);
    }
  });

  it('ends with the total timing duration for many slides', () => {
    const slides = Array.from({ length: 10 }, (_, i) => ({
      path: `${i}.jpg`,
      width: 1080,
      height: 1920,
    }));
    const t = { perSlide: 3.36, crossfade: 0.4, totalDuration: 30, addSilentAudio: false };
    const { inputDuration } = buildFiltergraph({ slides, canvas, timing: t });
    expect(inputDuration).toBeCloseTo(30, 9);
  });
});

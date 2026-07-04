import { describe, expect, it } from 'vitest';
import { buildFiltergraph } from '../../../src/render/filtergraph.js';

describe('buildFiltergraph', () => {
  const canvas = { width: 1080, height: 1920 };
  const timing = { perSlide: 3, totalDuration: 9, addSilentAudio: false };

  it('builds scale+pad filters for each slide', () => {
    const slides = [
      { path: 'a.jpg', width: 1080, height: 1920 },
      { path: 'b.jpg', width: 1080, height: 1920 },
    ];
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing, crossfadeSeconds: 0.4 });
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
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing, crossfadeSeconds: 0.4 });
    expect(filterComplex).toContain('xfade');
    expect(filterComplex).toContain('transition=fade');
  });

  it('does not include xfade for a single slide', () => {
    const slides = [{ path: 'a.jpg', width: 1080, height: 1920 }];
    const { filterComplex } = buildFiltergraph({ slides, canvas, timing, crossfadeSeconds: 0.4 });
    expect(filterComplex).not.toContain('xfade');
  });

  it('limits crossfade to half the per-slide duration', () => {
    const slides = [
      { path: 'a.jpg', width: 1080, height: 1920 },
      { path: 'b.jpg', width: 1080, height: 1920 },
    ];
    const shortTiming = { perSlide: 0.5, totalDuration: 1, addSilentAudio: false };
    const { filterComplex } = buildFiltergraph({
      slides,
      canvas,
      timing: shortTiming,
      crossfadeSeconds: 0.4,
    });
    expect(filterComplex).toContain('duration=0.25');
  });
});

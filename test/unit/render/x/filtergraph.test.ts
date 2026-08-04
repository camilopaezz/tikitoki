import { describe, expect, it } from 'vitest';
import { buildXOverlayFiltergraph, fitVideoToSlot } from '../../../../src/render/x/filtergraph.js';
import type { XPostLayout } from '../../../../src/render/x/types.js';

const layout: XPostLayout = {
  canvas: { width: 1080, height: 1200 },
  contentWidth: 1080,
  padX: 44,
  mediaSlot: { x: 44, y: 200, w: 992, h: 558, fit: 'contain', cornerRadius: 44 },
  sections: { headerH: 110, textH: 56, mediaTop: 200 },
};

describe('fitVideoToSlot', () => {
  it('builds contain pad chain', () => {
    const f = fitVideoToSlot(1280, 720, layout.mediaSlot);
    expect(f).toContain('force_original_aspect_ratio=decrease');
    expect(f).toContain('pad=992:558');
  });

  it('builds cover crop chain', () => {
    const slot = { ...layout.mediaSlot, fit: 'cover' as const, h: 1400 };
    const f = fitVideoToSlot(720, 1280, slot);
    expect(f).toContain('force_original_aspect_ratio=increase');
    expect(f).toContain('crop=992:1400');
  });
});

describe('buildXOverlayFiltergraph', () => {
  it('wires video under chrome overlay to [out]', () => {
    const g = buildXOverlayFiltergraph({
      layout,
      videoWidth: 1280,
      videoHeight: 720,
    });
    expect(g).toContain('[0:v]');
    expect(g).toContain('[1:v]');
    expect(g).toContain(`overlay=${layout.mediaSlot.x}:${layout.mediaSlot.y}`);
    expect(g).toContain('[out]');
    expect(g).toContain('yuv420p');
  });
});

import { describe, expect, it } from 'vitest';
import { buildXOverlayFiltergraph, fitVideoToSlot } from '../../../../src/render/x/filtergraph.js';
import type { XPostLayout } from '../../../../src/render/x/types.js';

const layout: XPostLayout = {
  canvas: { width: 720, height: 900 },
  contentWidth: 720,
  padX: 44,
  mediaSlot: { x: 177, y: 200, w: 498, h: 280, fit: 'contain', cornerRadius: 80 },
  sections: { headerH: 110, textH: 56, mediaTop: 200 },
};

describe('fitVideoToSlot', () => {
  it('builds contain pad chain', () => {
    const f = fitVideoToSlot(1280, 720, layout.mediaSlot);
    expect(f).toContain('force_original_aspect_ratio=decrease');
    expect(f).toContain('pad=498:280');
  });

  it('builds cover crop chain', () => {
    const slot = { ...layout.mediaSlot, fit: 'cover' as const, h: 624 };
    const f = fitVideoToSlot(720, 1280, slot);
    expect(f).toContain('force_original_aspect_ratio=increase');
    expect(f).toContain('crop=498:624');
  });
});

describe('buildXOverlayFiltergraph', () => {
  it('wires video under chrome overlay to [out] for full duration', () => {
    const g = buildXOverlayFiltergraph({
      layout,
      videoWidth: 1280,
      videoHeight: 720,
      durationSec: 17.32,
    });
    expect(g).toContain('[0:v]');
    expect(g).toContain('[1:v]');
    expect(g).toContain(`overlay=${layout.mediaSlot.x}:${layout.mediaSlot.y}`);
    expect(g).toContain('d=17.37');
    expect(g).toContain('chromakey=0x00FF00');
    expect(g).toContain('[out]');
    expect(g).toContain('yuv420p');
  });
});

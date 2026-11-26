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
    const f = fitVideoToSlot(layout.mediaSlot);
    expect(f).toContain('force_original_aspect_ratio=decrease');
    expect(f).toContain('pad=498:280');
  });

  it('builds cover crop chain', () => {
    const slot = { ...layout.mediaSlot, fit: 'cover' as const, h: 624 };
    const f = fitVideoToSlot(slot);
    expect(f).toContain('force_original_aspect_ratio=increase');
    expect(f).toContain('crop=498:624');
  });
});

describe('buildXOverlayFiltergraph', () => {
  it('pads the video onto the canvas and overlays chrome to [out]', () => {
    const g = buildXOverlayFiltergraph({ layout });
    expect(g).toContain('[0:v]fps=30,');
    expect(g).toContain(`pad=720:900:${layout.mediaSlot.x}:${layout.mediaSlot.y}:black[base]`);
    expect(g).not.toContain('color=');
    expect(g).toContain('[1:v]crop=720:900:0:0');
    expect(g).toContain('chromakey=0x00FF00');
    expect(g).toContain('[out]');
    expect(g).toContain('yuv420p');
  });

  it('keys the static chrome once and loops it instead of per frame', () => {
    const g = buildXOverlayFiltergraph({ layout });
    const chrome = g.split(';').find((p) => p.startsWith('[1:v]'));
    expect(chrome).toMatch(/chromakey=[^,]+,format=yuva420p,loop=loop=-1:size=1\[chrome\]$/);
  });

  it('crops the taller screenshot and scales it to a scaled-down canvas', () => {
    const scaled = { ...layout, canvas: { width: 690, height: 1280 } };
    const g = buildXOverlayFiltergraph({
      layout: scaled,
      chromeCrop: { width: 720, height: 1336 },
    });
    expect(g).toContain('[1:v]crop=720:1336:0:0,format=rgba,scale=690:1280,chromakey');
  });

  it('falls back to a 30 fps overlay base when the slot spills past the canvas', () => {
    const spill = {
      ...layout,
      mediaSlot: { ...layout.mediaSlot, x: 224, w: 498 },
    };
    const g = buildXOverlayFiltergraph({ layout: spill });
    expect(g).toContain('color=c=black:s=720x900:r=30[bg]');
    expect(g).toContain('[bg][vid]overlay=224:200:shortest=1[base]');
  });
});

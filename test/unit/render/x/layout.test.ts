import { describe, expect, it } from 'vitest';
import type { XPostAssets } from '../../../../src/fetch/downloadXAssets.js';
import {
  computeMediaSlotSize,
  layoutXPost,
  XRENDER_WIDTH,
} from '../../../../src/render/x/layout.js';

function assets(over: Partial<XPostAssets> = {}): XPostAssets {
  return {
    layoutKind: 'simple_video',
    statusId: '1',
    sourceUrl: 'https://x.com/u/status/1',
    outer: {
      author: { name: 'A', handle: 'a', verified: false },
      text: { text: 'hi', displayText: 'hi' },
    },
    primaryVideo: { path: '/v.mp4', width: 1280, height: 720, durationSec: 10 },
    ...over,
  };
}

describe('computeMediaSlotSize', () => {
  it('uses contain for landscape and derives height from aspect', () => {
    const s = computeMediaSlotSize(992, 1280, 720);
    expect(s.fit).toBe('contain');
    expect(s.w % 2).toBe(0);
    expect(s.h % 2).toBe(0);
    expect(s.h).toBeLessThan(s.w);
  });

  it('uses cover for tall video', () => {
    const s = computeMediaSlotSize(992, 720, 1280);
    expect(s.fit).toBe('cover');
    expect(s.h).toBeGreaterThan(s.w * 0.9);
  });
});

describe('layoutXPost', () => {
  it('uses fixed width and even dynamic height for simple video', () => {
    const layout = layoutXPost(assets());
    expect(layout.canvas.width).toBe(XRENDER_WIDTH);
    expect(layout.canvas.height % 2).toBe(0);
    expect(layout.mediaSlot.x).toBe(layout.padX);
    expect(layout.mediaSlot.w + layout.padX * 2).toBe(XRENDER_WIDTH);
    expect(layout.sections.quoteTop).toBeUndefined();
  });

  it('grows height when a quote card is present', () => {
    const simple = layoutXPost(assets());
    const withQuote = layoutXPost(
      assets({
        layoutKind: 'video_quotes',
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'She needs a Bbl', displayText: 'She needs a Bbl' },
          images: [],
        },
      }),
    );
    expect(withQuote.canvas.height).toBeGreaterThan(simple.canvas.height);
    expect(withQuote.sections.quoteTop).toBeDefined();
    expect(withQuote.sections.quoteH).toBeGreaterThan(0);
  });

  it('adds image band height for quote images', () => {
    const textOnly = layoutXPost(
      assets({
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'x', displayText: 'x' },
          images: [],
        },
      }),
    );
    const withImgs = layoutXPost(
      assets({
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'x', displayText: 'x' },
          images: [{ path: '/a.jpg' }, { path: '/b.jpg' }],
        },
      }),
    );
    expect(withImgs.sections.quoteH ?? 0).toBeGreaterThan(textOnly.sections.quoteH ?? 0);
  });
});

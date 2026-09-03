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

  it('contains tall video: full frame, reduced width under feed max height', () => {
    // Text-column width (~904) after avatar indent.
    const s = computeMediaSlotSize(904, 720, 1280);
    expect(s.fit).toBe('contain');
    // Max box H = 904 * 5/4 = 1130; 9:16 → w = 1130 * 9/16 ≈ 636.
    expect(s.h).toBe(1130);
    expect(s.w).toBeLessThan(904);
    expect(s.w).toBeGreaterThan(500);
    expect(s.w / s.h).toBeCloseTo(720 / 1280, 1);
  });

  it('fills text-column width for landscape', () => {
    const s = computeMediaSlotSize(904, 1280, 720);
    expect(s.fit).toBe('contain');
    expect(s.w).toBe(904);
    expect(s.h).toBeLessThan(s.w);
  });
});

describe('layoutXPost', () => {
  it('uses fixed width and even dynamic height for simple video', () => {
    const layout = layoutXPost(assets());
    expect(layout.canvas.width).toBe(XRENDER_WIDTH);
    expect(layout.canvas.height % 2).toBe(0);
    // Media aligns with text column (right of avatar), not card padX.
    expect(layout.mediaSlot.x).toBeGreaterThan(layout.padX);
    expect(layout.mediaSlot.w + layout.mediaSlot.x + layout.padX).toBeLessThanOrEqual(
      XRENDER_WIDTH,
    );
    expect(layout.sections.quoteTop).toBeUndefined();
  });

  it('places media just below the name row when the caption is empty', () => {
    const empty = layoutXPost(
      assets({
        outer: {
          author: { name: 'A', handle: 'a', verified: false },
          text: { text: '', displayText: '' },
        },
      }),
    );
    const withText = layoutXPost(assets());
    // Text column: PAD_TOP + NAME_LINE + GAP_HEADER_MEDIA — not below the avatar.
    expect(empty.sections.mediaTop).toBe(33 + 56 + 33);
    expect(empty.sections.mediaTop).toBeLessThan(withText.sections.mediaTop);
    expect(empty.sections.mediaTop).toBeLessThan(33 + 111 + 33);
    expect(empty.canvas.height).toBeLessThan(withText.canvas.height);
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

  it('adds image band height for multi quote images', () => {
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

  it('single quote image uses side-by-side height (not stacked band)', () => {
    const textOnly = layoutXPost(
      assets({
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'x', displayText: 'x' },
          images: [],
        },
      }),
    );
    const single = layoutXPost(
      assets({
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'x', displayText: 'x' },
          images: [{ path: '/a.jpg' }],
        },
      }),
    );
    const multi = layoutXPost(
      assets({
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'x', displayText: 'x' },
          images: [{ path: '/a.jpg' }, { path: '/b.jpg' }],
        },
      }),
    );
    // Side-by-side still taller than text-only (thumb floor), but shorter than stacked multi grid.
    expect(single.sections.quoteH ?? 0).toBeGreaterThan(textOnly.sections.quoteH ?? 0);
    expect(single.sections.quoteH ?? 0).toBeLessThan(multi.sections.quoteH ?? 0);
  });

  it('indents quote_of_video media into the quote inner column', () => {
    const outer = layoutXPost(assets());
    const nested = layoutXPost(
      assets({
        layoutKind: 'quote_of_video',
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'inside', displayText: 'inside' },
          images: [],
        },
      }),
    );
    expect(nested.mediaSlot.x).toBeGreaterThan(outer.mediaSlot.x);
    expect(nested.mediaSlot.w).toBeLessThan(outer.mediaSlot.w);
    expect(nested.mediaSlot.cornerRadius).toBe(80);
  });
});

import { describe, expect, it } from 'vitest';
import type { XPostAssets } from '../../../../src/fetch/downloadXAssets.js';
import {
  computeMediaSlotSize,
  layoutXPost,
  maxMediaHeight,
  X_LAYOUT_CONSTANTS,
  XRENDER_MAX_HEIGHT,
  XRENDER_WIDTH,
} from '../../../../src/render/x/layout.js';

function evenFloor(n: number): number {
  const r = Math.floor(n);
  return r % 2 === 0 ? r : r - 1;
}

const TEXT_COL_W = evenFloor(
  XRENDER_WIDTH -
    (X_LAYOUT_CONSTANTS.PAD_X + X_LAYOUT_CONSTANTS.AVATAR + X_LAYOUT_CONSTANTS.HEADER_GAP) -
    X_LAYOUT_CONSTANTS.PAD_X,
);

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
    const s = computeMediaSlotSize(TEXT_COL_W, 1280, 720);
    expect(s.fit).toBe('contain');
    expect(s.w % 2).toBe(0);
    expect(s.h % 2).toBe(0);
    expect(s.h).toBeLessThan(s.w);
  });

  it('contains tall video: full frame, reduced width under feed max height', () => {
    const s = computeMediaSlotSize(TEXT_COL_W, 720, 1280);
    expect(s.fit).toBe('contain');
    expect(s.h).toBe(maxMediaHeight(TEXT_COL_W));
    expect(s.w).toBeLessThan(TEXT_COL_W);
    expect(s.w / s.h).toBeCloseTo(720 / 1280, 1);
  });

  it('fills text-column width for landscape', () => {
    const s = computeMediaSlotSize(TEXT_COL_W, 1280, 720);
    expect(s.fit).toBe('contain');
    expect(s.w).toBe(TEXT_COL_W);
    expect(s.h).toBeLessThan(s.w);
  });
});

describe('layoutXPost', () => {
  it('uses fixed width and even dynamic height for simple video', () => {
    const layout = layoutXPost(assets());
    expect(layout.canvas.width).toBe(XRENDER_WIDTH);
    expect(layout.canvas.height % 2).toBe(0);
    expect(layout.canvas.height).toBeLessThanOrEqual(XRENDER_MAX_HEIGHT);
    // Media aligns with text column (right of avatar), not card padX.
    expect(layout.mediaSlot.x).toBeGreaterThan(layout.padX);
    expect(layout.mediaSlot.w + layout.mediaSlot.x + layout.padX).toBeLessThanOrEqual(
      XRENDER_WIDTH,
    );
    expect(layout.mediaSlot.w).toBe(TEXT_COL_W);
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
    expect(empty.sections.mediaTop).toBe(
      X_LAYOUT_CONSTANTS.PAD_TOP +
        X_LAYOUT_CONSTANTS.NAME_LINE +
        X_LAYOUT_CONSTANTS.GAP_HEADER_MEDIA,
    );
    expect(empty.sections.mediaTop).toBeLessThan(withText.sections.mediaTop);
    expect(empty.sections.mediaTop).toBeLessThan(
      X_LAYOUT_CONSTANTS.PAD_TOP + X_LAYOUT_CONSTANTS.AVATAR + X_LAYOUT_CONSTANTS.GAP_HEADER_MEDIA,
    );
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

  it('leaves a usable caption column beside a single quote image', () => {
    const { QUOTE_PAD, QUOTE_BORDER, QUOTE_SINGLE_IMG, HEADER_GAP } = X_LAYOUT_CONSTANTS;
    const quoteInner = TEXT_COL_W - QUOTE_PAD * 2 - QUOTE_BORDER * 2;
    const captionW = quoteInner - QUOTE_SINGLE_IMG - HEADER_GAP;
    expect(captionW).toBeGreaterThanOrEqual(200);
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
    expect(nested.mediaSlot.cornerRadius).toBe(X_LAYOUT_CONSTANTS.MEDIA_RADIUS);
  });

  it('shrinks tall video_quotes media; 10-line chrome may still exceed 1280', () => {
    const unconstrained = computeMediaSlotSize(TEXT_COL_W, 720, 1280);
    const layout = layoutXPost(
      assets({
        layoutKind: 'video_quotes',
        primaryVideo: { path: '/v.mp4', width: 720, height: 1280, durationSec: 10 },
        outer: {
          author: { name: 'A', handle: 'a', verified: false },
          text: {
            text: 'one two three lines of caption so the header is tall',
            displayText: 'one two three lines of caption so the header is tall',
          },
        },
        quote: {
          author: { name: 'Q', handle: 'q', verified: false },
          text: { text: 'quoted caption', displayText: 'quoted caption' },
          images: [{ path: '/a.jpg' }, { path: '/b.jpg' }],
        },
      }),
    );
    expect(layout.canvas.width).toBe(XRENDER_WIDTH);
    expect(layout.canvas.height % 2).toBe(0);
    // 10-line header + quote can exceed 1280 even with a tiny hole; encode scales later.
    expect(layout.mediaSlot.h).toBeLessThan(unconstrained.h);
    expect(layout.mediaSlot.h).toBeGreaterThan(2);
  });
});

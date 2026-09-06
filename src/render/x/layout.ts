import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { truncateTweetText } from '../../fetch/truncateTweetText.js';
import type { XMediaFit, XPostLayout } from './types.js';

/**
 * Fixed feed column width (even).
 * 720 so WhatsApp HD (720p video, always re-encoded) does not downscale
 * the chrome. Tokens scale from the 390 CSS-px live feed so the card is a
 * feed column, not a 1080-zoom crop on a 720 canvas.
 */
export const XRENDER_WIDTH = 720;

/** WhatsApp HD long edge. Taller canvases still get downscaled on forward. */
export const XRENDER_MAX_HEIGHT = 1280;

/** Live x.com mobile feed column, measured 2026-08-27. */
const FEED_CSS_W = 390;

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

/** Even, never larger than n — used so slot.x + slot.w + padX stays on-canvas. */
function evenFloor(n: number): number {
  const r = Math.floor(n);
  return r % 2 === 0 ? r : r - 1;
}

function tok(cssPx: number): number {
  return even((cssPx * XRENDER_WIDTH) / FEED_CSS_W);
}

const PAD_X = tok(16);
const PAD_TOP = tok(12);
const PAD_BOTTOM = tok(16);
const AVATAR = tok(40);
const HEADER_GAP = tok(8);
const FONT_SIZE = tok(15);
const LINE_HEIGHT = tok(20);
const NAME_LINE = LINE_HEIGHT;
const TEXT_LINE = LINE_HEIGHT;
/** Outer caption budget. Quote cards stay at 3 / 140 in chromeHtml.ts. */
const TEXT_MAX_LINES = 10;
const OUTER_TEXT_MAX_CHARS = 280;
const TEXT_MARGIN_TOP = tok(2);
const NAME_ROW_GAP = tok(4);
const GAP_HEADER_MEDIA = tok(12);
const GAP_MEDIA_QUOTE = tok(12);
const MEDIA_RADIUS = tok(28.8);
const MEDIA_BORDER = tok(1);
const QUOTE_PAD = tok(12);
const QUOTE_AVATAR = tok(24);
const QUOTE_NAME_LINE = LINE_HEIGHT;
const QUOTE_TEXT_LINE = LINE_HEIGHT;
const QUOTE_INNER_GAP = tok(4);
const QUOTE_RADIUS = tok(16);
const QUOTE_BORDER = tok(1);
const BADGE = tok(15);
const QUOTE_IMG_GAP = tok(2);
/** X feed quote thumb is always 4 text lines (80 @390). */
const QUOTE_SINGLE_IMG = 4 * LINE_HEIGHT;
/**
 * Max media-box height as a multiple of content width. Tall videos are
 * **contained** into this box (full frame visible) — width shrinks so aspect
 * is preserved, matching the X app feed (not full-column cover-crop).
 */
const MAX_MEDIA_H_RATIO = 5 / 4; // height / width of the fit box

/** Max media slot height for a given content width (even). */
export function maxMediaHeight(contentInnerW: number): number {
  return even(contentInnerW * MAX_MEDIA_H_RATIO);
}

/**
 * Size the media slot by containing the video in (contentWidth × maxH).
 * Landscape fills width; portrait shrinks width so the full frame fits the
 * height cap (X feed behaviour). Slot aspect matches the source → fit=contain.
 */
export function computeMediaSlotSize(
  contentInnerW: number,
  videoW: number,
  videoH: number,
): { w: number; h: number; fit: XMediaFit } {
  const maxW = even(contentInnerW);
  const maxH = maxMediaHeight(maxW);
  const aspect = videoW / videoH; // width / height

  let w: number;
  let h: number;
  if (maxW / maxH > aspect) {
    // Fit box is relatively wider than the video → height-limited (portrait).
    h = maxH;
    w = even(h * aspect);
  } else {
    // Width-limited (landscape / square / mild portrait under the cap).
    w = maxW;
    h = even(w / aspect);
  }

  w = Math.max(2, even(w));
  h = Math.max(2, even(Math.max(h, maxW * 0.4)));
  // If the min-height guard broke aspect on a landscape clip, re-cap to maxW.
  if (w > maxW) {
    w = maxW;
    h = even(Math.max(w / aspect, maxW * 0.4));
  }

  return { w, h, fit: 'contain' };
}

function quoteInnerWidth(textColW: number): number {
  return Math.max(2, even(textColW - QUOTE_PAD * 2 - QUOTE_BORDER * 2));
}

/** 16:9 band for 2–4 quote photos (live feed `aspect-video` + `grid-cols-2`). */
function quoteImagesBandH(nImgs: number, innerW: number): number {
  if (nImgs <= 0) return 0;
  if (nImgs === 1) return QUOTE_SINGLE_IMG;
  return QUOTE_INNER_GAP + even((innerW * 9) / 16);
}

/**
 * Geometry for xrender. Media **width/height/fit** are authoritative.
 * Media **Y** and final canvas **height** are upper-bound placeholders —
 * `renderXPost` overwrites them after measuring the chrome PNG so text wrap
 * never depends on chars-per-line guesses.
 */
export function layoutXPost(assets: XPostAssets): XPostLayout {
  const width = XRENDER_WIDTH;
  const padX = PAD_X;
  const textColX = padX + AVATAR + HEADER_GAP;
  const textColW = evenFloor(width - textColX - padX);
  const videoInsideQuote = assets.layoutKind === 'quote_of_video' && Boolean(assets.quote);
  const quoteInnerW = quoteInnerWidth(textColW);
  const mediaFitW = videoInsideQuote ? quoteInnerW : textColW;

  const hasOuterText = Boolean(
    truncateTweetText(assets.outer.text.displayText, TEXT_MAX_LINES, OUTER_TEXT_MAX_CHARS),
  );
  const textH = hasOuterText ? TEXT_MAX_LINES * TEXT_LINE : 0;
  const nameBlockH = NAME_LINE + (textH > 0 ? TEXT_MARGIN_TOP + textH : 0);
  const headerH = Math.max(AVATAR, nameBlockH);
  // Media/quote live in the text column (below name/caption), not under the avatar.
  const afterHeader = even(PAD_TOP + nameBlockH + GAP_HEADER_MEDIA);
  const media = computeMediaSlotSize(
    mediaFitW,
    assets.primaryVideo.width,
    assets.primaryVideo.height,
  );

  const mediaSlot = {
    x: videoInsideQuote ? even(textColX + QUOTE_PAD + QUOTE_BORDER) : textColX,
    y: afterHeader, // placeholder — replaced by measured green hole Y
    w: media.w,
    h: media.h,
    fit: media.fit,
    cornerRadius: MEDIA_RADIUS,
  };

  let height = afterHeader + media.h + PAD_BOTTOM;
  let quoteTop: number | undefined;
  let quoteH: number | undefined;
  let mediaTop = afterHeader;

  if (assets.quote) {
    const qTextH = assets.quote.text.displayText ? 3 * QUOTE_TEXT_LINE : 0;
    const qHeader = Math.max(QUOTE_AVATAR, QUOTE_NAME_LINE);
    const nImgs = videoInsideQuote ? 0 : assets.quote.images.length;
    const imgBand = quoteImagesBandH(nImgs, quoteInnerW);
    const textBlockH = qHeader + (qTextH ? QUOTE_INNER_GAP + qTextH : 0);
    const bodyH =
      nImgs === 1
        ? qHeader + QUOTE_INNER_GAP + Math.max(QUOTE_SINGLE_IMG, qTextH || 0)
        : textBlockH + imgBand + (videoInsideQuote ? QUOTE_INNER_GAP + media.h : 0);
    quoteH = even(QUOTE_PAD * 2 + QUOTE_BORDER * 2 + bodyH);

    if (videoInsideQuote) {
      quoteTop = afterHeader;
      mediaTop = even(afterHeader + QUOTE_PAD + QUOTE_BORDER + textBlockH + QUOTE_INNER_GAP);
      height = quoteTop + quoteH + PAD_BOTTOM;
    } else {
      quoteTop = afterHeader + media.h + GAP_MEDIA_QUOTE;
      height = quoteTop + quoteH + PAD_BOTTOM;
    }
  }

  const canvasH = even(height);
  if (canvasH > XRENDER_MAX_HEIGHT) {
    const overflow = canvasH - XRENDER_MAX_HEIGHT;
    // Don't crush the hole to 2px — 10-line chrome + quote can exceed 1280
    // without any media; renderXPost then scales the composited frame.
    const minMediaH = Math.max(2, even(mediaFitW * 0.4));
    const newH = Math.max(minMediaH, evenFloor(mediaSlot.h - overflow));
    const aspect = mediaSlot.w / mediaSlot.h;
    const delta = mediaSlot.h - newH;
    mediaSlot.h = newH;
    mediaSlot.w = Math.max(2, even(newH * aspect));
    if (videoInsideQuote && quoteH !== undefined) {
      quoteH = even(quoteH - delta);
      height = (quoteTop ?? 0) + quoteH + PAD_BOTTOM;
    } else if (quoteTop !== undefined) {
      quoteTop -= delta;
      height = quoteTop + (quoteH ?? 0) + PAD_BOTTOM;
    } else {
      height = afterHeader + newH + PAD_BOTTOM;
    }
  }

  return {
    canvas: { width, height: even(height) },
    mediaSlot: { ...mediaSlot, y: mediaTop },
    contentWidth: width,
    padX,
    sections: {
      headerH,
      textH,
      mediaTop,
      quoteTop,
      quoteH,
    },
  };
}

/** Exposed for tests / chrome builders. */
export const X_LAYOUT_CONSTANTS = {
  PAD_X,
  PAD_TOP,
  PAD_BOTTOM,
  AVATAR,
  HEADER_GAP,
  FONT_SIZE,
  LINE_HEIGHT,
  TEXT_MARGIN_TOP,
  NAME_ROW_GAP,
  MEDIA_RADIUS,
  MEDIA_BORDER,
  QUOTE_RADIUS,
  QUOTE_PAD,
  QUOTE_AVATAR,
  QUOTE_INNER_GAP,
  QUOTE_BORDER,
  QUOTE_SINGLE_IMG,
  QUOTE_IMG_GAP,
  BADGE,
  MAX_MEDIA_H_RATIO,
  TEXT_LINE,
  TEXT_MAX_LINES,
  OUTER_TEXT_MAX_CHARS,
  GAP_HEADER_MEDIA,
  GAP_MEDIA_QUOTE,
  NAME_LINE,
} as const;

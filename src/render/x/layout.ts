import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { truncateTweetText } from '../../fetch/truncateTweetText.js';
import type { XMediaFit, XPostLayout } from './types.js';

/** Fixed feed column width (even). */
export const XRENDER_WIDTH = 1080;

/**
 * 390 CSS-px feed tokens × 1080/390 ≈ 2.769, measured 2026-08-27 on live x.com.
 * Spacing tokens must match chromeHtml.ts document-flow styles.
 * Vertical media Y is NOT trusted from this module — Chromium lays out text,
 * then measureChromePng() reads the green hole. These numbers only size the
 * media slot and provide a tall-enough screenshot window upper bound.
 */
const PAD_X = 44; // 16
const PAD_TOP = 33; // 12
const PAD_BOTTOM = 44; // 16
const AVATAR = 111; // 40
const HEADER_GAP = 22; // 8
const FONT_SIZE = 42; // 15
const LINE_HEIGHT = 56; // 20
const NAME_LINE = LINE_HEIGHT;
const TEXT_LINE = LINE_HEIGHT;
/** Outer caption budget. Quote cards stay at 3 / 140 in chromeHtml.ts. */
const TEXT_MAX_LINES = 10;
const OUTER_TEXT_MAX_CHARS = 280;
const TEXT_MARGIN_TOP = 6; // 2 (gap-0.5)
const NAME_ROW_GAP = 11; // 4 (gap-1)
const GAP_HEADER_MEDIA = 33; // 12 (gap-3)
const GAP_MEDIA_QUOTE = 33; // 12
const MEDIA_RADIUS = 80; // 28.8 rounded-md
const MEDIA_BORDER = 3; // 1px hairline
const QUOTE_PAD = 33; // 12 (p-3)
const QUOTE_AVATAR = 66; // 24
const QUOTE_NAME_LINE = LINE_HEIGHT;
const QUOTE_TEXT_LINE = LINE_HEIGHT;
const QUOTE_INNER_GAP = 11; // 4 (gap-1)
const QUOTE_RADIUS = 44; // 16
const QUOTE_BORDER = 3;
const BADGE = 42; // 15
/** X feed quote thumb is always 4 text lines (80 @390). */
const QUOTE_SINGLE_IMG = 4 * LINE_HEIGHT;
const QUOTE_IMG_GAP = 6; // 2 (gap-0.5)
/**
 * Max media-box height as a multiple of content width. Tall videos are
 * **contained** into this box (full frame visible) — width shrinks so aspect
 * is preserved, matching the X app feed (not full-column cover-crop).
 */
const MAX_MEDIA_H_RATIO = 5 / 4; // height / width of the fit box

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

/** Even, never larger than n — used so slot.x + slot.w + padX stays on-canvas. */
function evenFloor(n: number): number {
  const r = Math.floor(n);
  return r % 2 === 0 ? r : r - 1;
}

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

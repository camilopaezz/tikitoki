import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { truncateTweetText } from '../../fetch/truncateTweetText.js';
import type { XMediaFit, XPostLayout } from './types.js';

/** Fixed feed column width (even). */
export const XRENDER_WIDTH = 1080;

// Spacing tokens must match chromeHtml.ts document-flow styles.
// Vertical media Y is NOT trusted from this module — Chromium lays out text,
// then measureChromePng() reads the green hole. These numbers only size the
// media slot and provide a tall-enough screenshot window upper bound.
const PAD_X = 44; // ~16px at 390 → scale 1080/390
const PAD_TOP = 33;
const PAD_BOTTOM = 44;
const AVATAR = 72;
/** Gap between outer avatar and name/text column (matches chromeHtml .header gap). */
const HEADER_GAP = 16;
const NAME_LINE = 44; // 36px font / 44px line-height
const TEXT_LINE = 44;
const TEXT_MAX_LINES = 3;
const TEXT_MARGIN_TOP = 8;
const GAP_HEADER_MEDIA = 12;
const GAP_MEDIA_QUOTE = 24;
const MEDIA_RADIUS = 44;
const QUOTE_PAD = 20;
const QUOTE_AVATAR = 40;
const QUOTE_NAME_LINE = 38;
const QUOTE_TEXT_LINE = 42;
const QUOTE_TEXT_MARGIN_TOP = 8;
const QUOTE_RADIUS = 44;
const QUOTE_IMAGES_H = 180 + 12; // .qimg height + margin-top
/**
 * Max media-box height as a multiple of content width. Tall videos are
 * **contained** into this box (full frame visible) — width shrinks so aspect
 * is preserved, matching the X app feed (not full-column cover-crop).
 * At 904 text-column width → max H ≈ 1130; 9:16 → ~636×1130 left-aligned with text.
 */
const MAX_MEDIA_H_RATIO = 5 / 4; // height / width of the fit box

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
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

/**
 * Geometry for xrender. Media **width/height/fit** are authoritative.
 * Media **Y** and final canvas **height** are upper-bound placeholders —
 * `renderXPost` overwrites them after measuring the chrome PNG so text wrap
 * never depends on chars-per-line guesses.
 */
export function layoutXPost(assets: XPostAssets): XPostLayout {
  const width = XRENDER_WIDTH;
  const padX = PAD_X;
  const innerW = width - padX * 2;
  // Media + caption sit in the text column under the name (right of avatar).
  const textColX = padX + AVATAR + HEADER_GAP;
  const textColW = even(width - textColX - padX);

  // Upper bound for screenshot window: always reserve max caption lines when
  // any outer text exists (Chromium may wrap more than a char estimate).
  const hasOuterText = Boolean(truncateTweetText(assets.outer.text.displayText, 3, 180));
  const textH = hasOuterText ? TEXT_MAX_LINES * TEXT_LINE : 0;
  const nameBlockH = NAME_LINE + (textH > 0 ? TEXT_MARGIN_TOP + textH : 0);
  const headerH = Math.max(AVATAR, nameBlockH);
  const mediaTop = even(PAD_TOP + headerH + GAP_HEADER_MEDIA);
  const media = computeMediaSlotSize(textColW, assets.primaryVideo.width, assets.primaryVideo.height);

  const mediaSlot = {
    // Align with text column left (X feed). Measured green hole refines X/Y.
    x: textColX,
    y: mediaTop, // placeholder — replaced by measured green hole Y
    w: media.w,
    h: media.h,
    fit: media.fit,
    cornerRadius: MEDIA_RADIUS,
  };

  let height = mediaTop + media.h + PAD_BOTTOM;
  let quoteTop: number | undefined;
  let quoteH: number | undefined;

  if (assets.quote) {
    quoteTop = mediaTop + media.h + GAP_MEDIA_QUOTE;
    // Upper-bound quote height (flow sizes naturally; we only need window room).
    const qTextH = assets.quote.text.displayText
      ? 3 * QUOTE_TEXT_LINE
      : 0;
    const qHeader = Math.max(QUOTE_AVATAR, QUOTE_NAME_LINE);
    const imagesH = assets.quote.images.length > 0 ? QUOTE_IMAGES_H : 0;
    quoteH = even(
      QUOTE_PAD * 2 + qHeader + (qTextH ? QUOTE_TEXT_MARGIN_TOP + qTextH : 0) + imagesH,
    );
    height = quoteTop + quoteH + PAD_BOTTOM;
  }

  return {
    canvas: { width, height: even(height) },
    mediaSlot,
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
  MEDIA_RADIUS,
  QUOTE_RADIUS,
  MAX_MEDIA_H_RATIO,
  TEXT_LINE,
  GAP_HEADER_MEDIA,
  NAME_LINE,
  TEXT_MARGIN_TOP,
} as const;

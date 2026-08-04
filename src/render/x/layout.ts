import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { truncateTweetText } from '../../fetch/truncateTweetText.js';
import type { XMediaFit, XPostLayout } from './types.js';

/** Fixed feed column width (even). */
export const XRENDER_WIDTH = 1080;

// Spacing must match absolute chrome HTML (chromeHtml.ts) so media hole sits
// tight under header/text — not a large empty gap above the video.
const PAD_X = 44; // ~16px at 390 → scale 1080/390
const PAD_TOP = 33; // header top
const PAD_BOTTOM = 44;
const AVATAR = 72; // chrome avatar size
const NAME_LINE = 36; // 28px font / 36px line-height
const TEXT_LINE = 36;
const TEXT_MAX_LINES = 3;
const TEXT_MARGIN_TOP = 8;
const GAP_HEADER_MEDIA = 24; // space between header block and media hole
const GAP_MEDIA_QUOTE = 24;
const MEDIA_RADIUS = 44; // ~16px scaled
const QUOTE_PAD = 20;
const QUOTE_AVATAR = 40;
const QUOTE_NAME_LINE = 32;
const QUOTE_RADIUS = 44;
const MAX_MEDIA_H = 1600;
const CHARS_PER_LINE = 42; // ~28px type at 992 content width

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

function estimateTextHeight(displayText: string, maxLines = TEXT_MAX_LINES): number {
  const t = truncateTweetText(displayText, maxLines, 180);
  if (!t) return 0;
  const lines = Math.min(maxLines, Math.max(1, Math.ceil(t.length / CHARS_PER_LINE)));
  return lines * TEXT_LINE;
}

function mediaFit(videoW: number, videoH: number): XMediaFit {
  return videoW / videoH >= 1 ? 'contain' : 'cover';
}

/**
 * Compute media slot size for a content width, clamping extreme portrait height.
 */
export function computeMediaSlotSize(
  contentInnerW: number,
  videoW: number,
  videoH: number,
): { w: number; h: number; fit: XMediaFit } {
  const w = even(contentInnerW);
  const aspect = videoW / videoH;
  const fit = mediaFit(videoW, videoH);

  let h: number;
  if (fit === 'contain') {
    // Landscape / square: height from aspect (letterbox inside if needed at encode).
    h = even(w / aspect);
  } else {
    // Tall: prefer natural height from width, clamp.
    h = even(Math.min(w / aspect, MAX_MEDIA_H));
  }

  h = Math.max(h, even(w * 0.4)); // avoid tiny strips
  return { w, h, fit };
}

/**
 * Pure layout geometry from downloaded xrender assets.
 * Canvas: fixed width, dynamic height. No timestamps / engagement / duration UI.
 */
export function layoutXPost(assets: XPostAssets): XPostLayout {
  const width = XRENDER_WIDTH;
  const padX = PAD_X;
  const innerW = width - padX * 2;

  // Header block: avatar row + optional caption under name (matches chromeHtml).
  const textH = estimateTextHeight(assets.outer.text.displayText);
  const nameBlockH = NAME_LINE + (textH > 0 ? TEXT_MARGIN_TOP + textH : 0);
  const headerH = Math.max(AVATAR, nameBlockH);
  const mediaTop = even(PAD_TOP + headerH + GAP_HEADER_MEDIA);
  const media = computeMediaSlotSize(innerW, assets.primaryVideo.width, assets.primaryVideo.height);

  const mediaSlot = {
    x: padX,
    y: mediaTop,
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
    const qTextH = estimateTextHeight(assets.quote.text.displayText, 3);
    const qHeader = Math.max(QUOTE_AVATAR, QUOTE_NAME_LINE);
    let imagesH = 0;
    if (assets.quote.images.length > 0) {
      // Dual-tile or single strip under quote text.
      imagesH = even(innerW * 0.35) + 12;
    }
    // Nested video layouts still only reserve outer media slot for primary video;
    // quote card is text/images chrome (quote_of_video uses same outer media hole).
    quoteH = QUOTE_PAD * 2 + qHeader + (qTextH ? 8 + qTextH : 0) + imagesH;
    quoteH = even(quoteH);
    height = quoteTop + quoteH + PAD_BOTTOM;
  }

  // quote_of_video: primary video is the nested one but we still show it as the
  // main media hole under outer text (product mock 02) — geometry already matches.

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
  MEDIA_RADIUS,
  QUOTE_RADIUS,
  MAX_MEDIA_H,
  TEXT_LINE,
} as const;

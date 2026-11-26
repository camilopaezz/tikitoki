import type { XMediaFit, XMediaSlot, XPostLayout } from './types.js';

/** Output frame rate for feed-card renders. */
export const XRENDER_FPS = 30;

export interface XOverlayFilterInputs {
  /** Final (possibly scaled-down) encode layout. */
  layout: XPostLayout;
  /**
   * Region of the raw chrome screenshot that holds the card (top-left
   * anchored). Cropped in-graph, then scaled to `layout.canvas` when the card
   * was taller than the encode limit. Defaults to the canvas size.
   */
  chromeCrop?: { width: number; height: number };
}

/**
 * Build filter_complex for `-i video -i chrome.png` (chrome as a single
 * frame, not `-loop 1`):
 *
 *  [0:v] → 30 fps → fit into media slot → pad onto a black canvas at the slot
 *  [1:v] → crop/scale → chromakey green hole → yuva420p, computed ONCE and
 *          repeated with `loop` (the chrome is static)
 *  overlay chrome on the video canvas
 *
 * The video drives output timing, so every source frame up to 30 fps is kept
 * (a `color` source here would default to 25 fps and decimate the video).
 * Chrome media hole is #00FF00 because headless screenshots have no alpha.
 */
export function buildXOverlayFiltergraph(inputs: XOverlayFilterInputs): string {
  const { layout } = inputs;
  const { canvas, mediaSlot } = layout;
  const crop = inputs.chromeCrop ?? canvas;
  const fitFilters = fitVideoToSlot(mediaSlot);
  const scaleChrome =
    crop.width === canvas.width && crop.height === canvas.height
      ? ''
      : `,scale=${canvas.width}:${canvas.height}`;

  const video = `[0:v]fps=${XRENDER_FPS},${fitFilters},setsar=1,format=yuv420p`;
  const fits =
    mediaSlot.x + mediaSlot.w <= canvas.width && mediaSlot.y + mediaSlot.h <= canvas.height;
  // pad is cheapest; overlay clips a slot that spills past the canvas edge
  // (possible by a pixel or two after even-rounding a scaled layout).
  const base = fits
    ? `${video},pad=${canvas.width}:${canvas.height}:${mediaSlot.x}:${mediaSlot.y}:black[base]`
    : `${video}[vid];color=c=black:s=${canvas.width}x${canvas.height}:r=${XRENDER_FPS}[bg];` +
      `[bg][vid]overlay=${mediaSlot.x}:${mediaSlot.y}:shortest=1[base]`;

  const parts = [
    base,
    // similarity/blend high enough to eat anti-aliased green fringe on the
    // rounded hole edge (was a visible green ring at 0.12:0.08).
    `[1:v]crop=${crop.width}:${crop.height}:0:0,format=rgba${scaleChrome},` +
      'chromakey=0x00FF00:0.22:0.12,format=yuva420p,loop=loop=-1:size=1[chrome]',
    '[base][chrome]overlay=0:0:shortest=1:format=yuv420,format=yuv420p,setparams=range=tv[out]',
  ];

  return parts.join(';');
}

/** Exposed for unit tests. */
export function fitVideoToSlot(slot: XMediaSlot): string {
  const fit: XMediaFit = slot.fit;
  const sw = slot.w;
  const sh = slot.h;

  if (fit === 'cover') {
    return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh}`;
  }

  return `scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:black`;
}

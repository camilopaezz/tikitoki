import type { XMediaFit, XMediaSlot, XPostLayout } from './types.js';

export interface XOverlayFilterInputs {
  layout: XPostLayout;
  videoWidth: number;
  videoHeight: number;
  /** Input indices: 0 = video, 1 = chrome PNG (looped). */
}

/**
 * Build filter_complex for:
 *   [0:v] video → scale/pad or scale/crop into media slot
 *   [1:v] chrome PNG (with transparent hole + UI)
 *   overlay video under chrome (chrome on top so hole shows video)
 *
 * Actually: place scaled video on black canvas at slot, then overlay chrome PNG
 * on top (chrome has transparent media hole).
 */
export function buildXOverlayFiltergraph(inputs: XOverlayFilterInputs): string {
  const { layout, videoWidth, videoHeight } = inputs;
  const { canvas, mediaSlot } = layout;
  const fitFilters = fitVideoToSlot(videoWidth, videoHeight, mediaSlot);

  // [0:v] fit into slot-sized frame [vid]
  // color black canvas [bg]
  // overlay vid onto bg at slot x,y [base]
  // overlay chrome PNG (input 1) on top [out]
  const parts = [
    `[0:v]${fitFilters},setsar=1,format=yuva420p[vid]`,
    `color=c=black:s=${canvas.width}x${canvas.height}:d=1[bg]`,
    `[bg][vid]overlay=${mediaSlot.x}:${mediaSlot.y}:shortest=1[base]`,
    `[1:v]format=rgba,scale=${canvas.width}:${canvas.height}[chrome]`,
    `[base][chrome]overlay=0:0:format=auto:shortest=1,format=yuv420p,setparams=range=tv[out]`,
  ];

  return parts.join(';');
}

/** Exposed for unit tests. */
export function fitVideoToSlot(_videoW: number, _videoH: number, slot: XMediaSlot): string {
  // Slot fit mode is chosen in layout from video aspect; scale filters use slot size.
  const fit: XMediaFit = slot.fit;
  const sw = slot.w;
  const sh = slot.h;

  if (fit === 'cover') {
    // Scale to fill, then center-crop to slot.
    return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh}`;
  }

  // contain: scale to fit inside, pad to slot with black
  return `scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:black`;
}

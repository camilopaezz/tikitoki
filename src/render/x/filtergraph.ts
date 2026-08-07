import type { XMediaFit, XMediaSlot, XPostLayout } from './types.js';

export interface XOverlayFilterInputs {
  layout: XPostLayout;
  videoWidth: number;
  videoHeight: number;
  /** Full output duration in seconds (matches primary video). */
  durationSec: number;
}

/**
 * Build filter_complex:
 *  [0:v] video → fit into media slot
 *  black canvas for full duration
 *  place video at slot
 *  [1:v] chrome PNG → chromakey green media hole → overlay on top
 *
 * Chrome media hole is filled with #00FF00 because headless Chromium screenshots
 * do not preserve alpha.
 */
export function buildXOverlayFiltergraph(inputs: XOverlayFilterInputs): string {
  const { layout, videoWidth, videoHeight, durationSec } = inputs;
  const { canvas, mediaSlot } = layout;
  const fitFilters = fitVideoToSlot(videoWidth, videoHeight, mediaSlot);
  // Slight pad so -shortest / encoder don't cut a frame early.
  const d = Math.max(0.1, durationSec + 0.05);

  const parts = [
    `[0:v]${fitFilters},setsar=1,format=yuv420p[vid]`,
    `color=c=black:s=${canvas.width}x${canvas.height}:d=${d}[bg]`,
    `[bg][vid]overlay=${mediaSlot.x}:${mediaSlot.y}:shortest=1[base]`,
    // similarity/blend high enough to eat anti-aliased green fringe on the
    // rounded hole edge (was a visible green ring at 0.12:0.08).
    `[1:v]format=rgba,scale=${canvas.width}:${canvas.height},chromakey=0x00FF00:0.22:0.12[chrome]`,
    `[base][chrome]overlay=0:0:shortest=1,format=yuv420p,setparams=range=tv[out]`,
  ];

  return parts.join(';');
}

/** Exposed for unit tests. */
export function fitVideoToSlot(_videoW: number, _videoH: number, slot: XMediaSlot): string {
  const fit: XMediaFit = slot.fit;
  const sw = slot.w;
  const sh = slot.h;

  if (fit === 'cover') {
    return `scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh}`;
  }

  return `scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:black`;
}

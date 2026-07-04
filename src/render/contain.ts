import type { Canvas, Slide } from './canvas.js';

export interface ContainFilter {
  scaleWidth: number;
  scaleHeight: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
}

export function containFilter(slide: Slide, canvas: Canvas): ContainFilter {
  const slideAspect = slide.width / slide.height;
  const canvasAspect = canvas.width / canvas.height;

  let scaleWidth: number;
  let scaleHeight: number;

  if (slideAspect > canvasAspect) {
    // Slide is wider relative to canvas: fit to width, letterbox top/bottom.
    scaleWidth = canvas.width;
    scaleHeight = Math.round(canvas.width / slideAspect);
  } else {
    // Slide is taller or equal: fit to height, letterbox left/right.
    scaleHeight = canvas.height;
    scaleWidth = Math.round(canvas.height * slideAspect);
  }

  // Ensure even dimensions for the scaled frame.
  scaleWidth = scaleWidth % 2 === 0 ? scaleWidth : scaleWidth + 1;
  scaleHeight = scaleHeight % 2 === 0 ? scaleHeight : scaleHeight + 1;

  const padLeft = Math.floor((canvas.width - scaleWidth) / 2);
  const padRight = canvas.width - scaleWidth - padLeft;
  const padTop = Math.floor((canvas.height - scaleHeight) / 2);
  const padBottom = canvas.height - scaleHeight - padTop;

  return { scaleWidth, scaleHeight, padTop, padBottom, padLeft, padRight };
}

export function scalePadExpression(filter: ContainFilter): string {
  return `scale=${filter.scaleWidth}:${filter.scaleHeight}:force_original_aspect_ratio=decrease,pad=${filter.padLeft + filter.padRight + filter.scaleWidth}:${filter.padTop + filter.padBottom + filter.scaleHeight}:${filter.padLeft}:${filter.padTop}:black`;
}

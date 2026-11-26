import type { Canvas, Slide } from './canvas.js';
import { containFilter, scalePadExpression } from './contain.js';
import type { Timing } from './timing.js';

export interface FiltergraphInputs {
  slides: Slide[];
  canvas: Canvas;
  timing: Timing;
}

export interface FiltergraphResult {
  filterComplex: string;
  inputDuration: number;
}

/**
 * Slideshow graph for single-frame image inputs (`-framerate 30 -i img`, no
 * `-loop 1`). Each still is decoded and scale+padded once, then repeated with
 * `loop` and cut to `perSlide` — instead of re-decoding and re-scaling the
 * image for every output frame.
 */
export function buildFiltergraph(inputs: FiltergraphInputs): FiltergraphResult {
  const { slides, canvas, timing } = inputs;
  const count = slides.length;

  if (count === 0) {
    throw new Error('Cannot build filtergraph for empty slides');
  }

  const crossfade = timing.crossfade;
  const parts: string[] = [];

  // Step 1: scale+pad each slide into the canvas, once, then hold it.
  for (let i = 0; i < count; i++) {
    const filter = containFilter(slides[i], canvas);
    parts.push(
      `[${i}:v]${scalePadExpression(filter)},loop=loop=-1:size=1:start=0,trim=duration=${timing.perSlide}[v${i}]`,
    );
  }

  if (count === 1) {
    parts.push('[v0]format=pix_fmts=yuv420p[out]');
    return { filterComplex: parts.join(';'), inputDuration: timing.perSlide };
  }

  // Step 2: chain xfade filters.
  // Each input stream is `timing.perSlide` seconds long.
  // The first xfade starts at `perSlide - crossfade`; its output is `2*perSlide - crossfade`.
  // Each subsequent xfade offset is the previous output duration minus crossfade.
  let previousLabel = 'v0';
  let previousOutputDuration = timing.perSlide;

  for (let i = 1; i < count; i++) {
    const offset = previousOutputDuration - crossfade;
    const outputLabel = i === count - 1 ? 'preout' : `xf${i}`;

    parts.push(
      `[${previousLabel}][v${i}]xfade=transition=fade:duration=${crossfade}:offset=${offset}[${outputLabel}]`,
    );

    previousLabel = outputLabel;
    previousOutputDuration = offset + timing.perSlide;
  }

  // Force pixel format and limited (TV) range for player compatibility.
  parts.push('[preout]format=pix_fmts=yuv420p,setparams=range=tv[out]');

  return { filterComplex: parts.join(';'), inputDuration: previousOutputDuration };
}

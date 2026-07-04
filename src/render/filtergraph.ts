import type { Canvas, Slide } from './canvas.js';
import { containFilter, scalePadExpression } from './contain.js';
import type { Timing } from './timing.js';

export interface FiltergraphInputs {
  slides: Slide[];
  canvas: Canvas;
  timing: Timing;
  crossfadeSeconds: number;
}

export interface FiltergraphResult {
  filterComplex: string;
  inputDuration: number;
}

export function buildFiltergraph(inputs: FiltergraphInputs): FiltergraphResult {
  const { slides, canvas, timing, crossfadeSeconds } = inputs;
  const count = slides.length;

  if (count === 0) {
    throw new Error('Cannot build filtergraph for empty slides');
  }

  const effectiveCrossfade = Math.min(crossfadeSeconds, timing.perSlide / 2);
  const parts: string[] = [];

  // Step 1: scale+pad each slide into the canvas.
  for (let i = 0; i < count; i++) {
    const filter = containFilter(slides[i], canvas);
    parts.push(`[${i}:v]${scalePadExpression(filter)}[v${i}]`);
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
    const offset = previousOutputDuration - effectiveCrossfade;
    const currentInputLabel = `v${i}`;
    const outputLabel = i === count - 1 ? 'out' : `xf${i}`;

    parts.push(
      `[${previousLabel}][${currentInputLabel}]xfade=transition=fade:duration=${effectiveCrossfade}:offset=${offset}[${outputLabel}]`,
    );

    previousLabel = outputLabel;
    previousOutputDuration = offset + timing.perSlide;
  }

  // Force pixel format and limited (TV) range for player compatibility.
  const finalPart = parts[parts.length - 1];
  if (!finalPart.endsWith('[out]')) {
    parts.push('[out]format=pix_fmts=yuv420p,setparams=range=tv[out]');
  } else {
    parts[parts.length - 1] = finalPart.replace('[out]', '[preout]');
    parts.push('[preout]format=pix_fmts=yuv420p,setparams=range=tv[out]');
  }

  return { filterComplex: parts.join(';'), inputDuration: previousOutputDuration };
}

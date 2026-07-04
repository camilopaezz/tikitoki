import type { Canvas } from './canvas.js';

export function downscaleTo720(canvas: Canvas): Canvas {
  const maxDim = 1280;
  const aspect = canvas.width / canvas.height;

  let width: number;
  let height: number;

  if (canvas.width >= canvas.height) {
    width = maxDim;
    height = Math.round(width / aspect);
  } else {
    height = maxDim;
    width = Math.round(height * aspect);
  }

  width = width % 2 === 0 ? width : width + 1;
  height = height % 2 === 0 ? height : height + 1;

  return { width, height };
}

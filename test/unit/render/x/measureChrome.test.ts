import { describe, expect, it } from 'vitest';
import { measureChromeRgba } from '../../../../src/render/x/measureChrome.js';

function canvas(width: number, height: number) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255; // opaque black
  const fill = (x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 4;
        rgba[i] = rgb[0];
        rgba[i + 1] = rgb[1];
        rgba[i + 2] = rgb[2];
      }
    }
  };
  return { img: { width, height, rgba }, fill };
}

describe('measureChromeRgba', () => {
  it('finds the green hole and pads content height to an even row', () => {
    const { img, fill } = canvas(100, 400);
    fill(10, 10, 50, 8, [230, 233, 234]); // caption text
    fill(20, 40, 60, 30, [0, 255, 0]); // media hole
    fill(20, 80, 40, 5, [113, 118, 122]); // quote text below the hole
    const m = measureChromeRgba(img, 44);
    expect(m).toEqual({ x: 20, y: 40, greenW: 60, greenH: 30, contentHeight: 130 });
  });

  it('never returns a crop taller than the PNG, and keeps it even', () => {
    const { img, fill } = canvas(40, 101);
    fill(0, 0, 40, 101, [0, 255, 0]);
    expect(measureChromeRgba(img, 44).contentHeight).toBe(100);
  });

  it('ignores near-black and transparent pixels when finding the bottom', () => {
    const { img, fill } = canvas(40, 300);
    fill(0, 10, 10, 10, [0, 255, 0]);
    fill(0, 200, 40, 10, [10, 10, 10]); // near-black
    expect(measureChromeRgba(img, 0).contentHeight).toBe(20);
  });

  it('throws when there is no green hole', () => {
    const { img, fill } = canvas(10, 10);
    fill(0, 0, 5, 5, [255, 255, 255]);
    expect(() => measureChromeRgba(img)).toThrow(/No chromakey green/);
  });
});

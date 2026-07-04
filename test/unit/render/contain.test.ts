import { describe, expect, it } from 'vitest';
import { containFilter, scalePadExpression } from '../../../src/render/contain.js';

describe('containFilter', () => {
  it('letterboxes a landscape slide in a portrait canvas on top/bottom', () => {
    const canvas = { width: 1080, height: 1920 };
    const slide = { path: 'wide.jpg', width: 1920, height: 1080 };
    const filter = containFilter(slide, canvas);
    expect(filter.scaleWidth).toBeLessThanOrEqual(canvas.width);
    expect(filter.scaleHeight).toBeLessThanOrEqual(canvas.height);
    expect(filter.padLeft + filter.padRight).toBe(0);
    expect(filter.padTop + filter.padBottom).toBeGreaterThan(0);
  });

  it('letterboxes a portrait slide in a landscape canvas on left/right', () => {
    const canvas = { width: 1920, height: 1080 };
    const slide = { path: 'tall.jpg', width: 1080, height: 1920 };
    const filter = containFilter(slide, canvas);
    expect(filter.scaleWidth).toBeLessThanOrEqual(canvas.width);
    expect(filter.scaleHeight).toBeLessThanOrEqual(canvas.height);
    expect(filter.padLeft + filter.padRight).toBeGreaterThan(0);
    expect(filter.padTop + filter.padBottom).toBe(0);
  });
});

describe('scalePadExpression', () => {
  it('includes scale and pad with black filler', () => {
    const canvas = { width: 100, height: 100 };
    const slide = { path: 'a.jpg', width: 50, height: 50 };
    const expr = scalePadExpression(containFilter(slide, canvas));
    expect(expr).toContain('scale=');
    expect(expr).toContain('pad=');
    expect(expr).toContain(':black');
  });
});

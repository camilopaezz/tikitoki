import { describe, expect, it } from 'vitest';
import { pickCanvas } from '../../../src/render/canvas.js';

describe('pickCanvas', () => {
  it('picks the largest slide by area', () => {
    const slides = [
      { path: 'a.jpg', width: 100, height: 100 },
      { path: 'b.jpg', width: 200, height: 300 },
      { path: 'c.jpg', width: 150, height: 150 },
    ];
    expect(pickCanvas(slides)).toEqual({ width: 200, height: 300 });
  });

  it('rounds odd dimensions up to even', () => {
    const slides = [{ path: 'a.jpg', width: 101, height: 199 }];
    expect(pickCanvas(slides)).toEqual({ width: 102, height: 200 });
  });

  it('throws for empty slides', () => {
    expect(() => pickCanvas([])).toThrow('empty slide list');
  });
});

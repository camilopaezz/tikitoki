import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, readPngSize, UnsupportedPngError } from '../../../src/render/png.js';

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  // CRC is not verified by the decoder; zeros keep the fixture small.
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Encode raw pixels, cycling filter types 0–4 per row so every unfilter path runs. */
function encodePng(
  width: number,
  height: number,
  channels: number,
  colorType: number,
  pixels: Uint8Array,
  opts: { interlace?: number; bitDepth?: number; splitIdat?: boolean } = {},
): Buffer {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const x = pixels[y * stride + i];
      const a = i >= channels ? pixels[y * stride + i - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const c = i >= channels && y > 0 ? pixels[(y - 1) * stride + i - channels] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      raw[y * (stride + 1) + 1 + i] = (x - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = opts.bitDepth ?? 8;
  ihdr[9] = colorType;
  ihdr[12] = opts.interlace ?? 0;
  const z = deflateSync(raw);
  const idat = opts.splitIdat
    ? [chunk('IDAT', z.subarray(0, 7)), chunk('IDAT', z.subarray(7))]
    : [chunk('IDAT', z)];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...idat,
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function noise(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

describe('decodePng', () => {
  it('round-trips RGBA through every filter type', () => {
    const w = 7;
    const h = 11;
    const px = noise(w * h * 4, 1);
    const img = decodePng(encodePng(w, h, 4, 6, px, { splitIdat: true }));
    expect(img.width).toBe(w);
    expect(img.height).toBe(h);
    expect(Buffer.from(img.rgba).equals(Buffer.from(px))).toBe(true);
  });

  it('expands RGB to opaque RGBA', () => {
    const w = 5;
    const h = 6;
    const px = noise(w * h * 3, 2);
    const { rgba } = decodePng(encodePng(w, h, 3, 2, px));
    for (let p = 0; p < w * h; p++) {
      expect([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2], rgba[p * 4 + 3]]).toEqual([
        px[p * 3],
        px[p * 3 + 1],
        px[p * 3 + 2],
        255,
      ]);
    }
  });

  it('expands gray and gray+alpha', () => {
    const gray = decodePng(encodePng(3, 5, 1, 0, noise(15, 3)));
    expect(gray.rgba[3]).toBe(255);
    expect(gray.rgba[0]).toBe(gray.rgba[1]);
    const ga = noise(30, 4);
    const grayA = decodePng(encodePng(3, 5, 2, 4, ga));
    expect(grayA.rgba[0]).toBe(ga[0]);
    expect(grayA.rgba[3]).toBe(ga[1]);
  });

  it('rejects formats it does not implement so callers can fall back', () => {
    const px = noise(4 * 4 * 3, 5);
    expect(() => decodePng(encodePng(4, 4, 3, 2, px, { interlace: 1 }))).toThrow(
      UnsupportedPngError,
    );
    expect(() => decodePng(encodePng(4, 4, 3, 2, px, { bitDepth: 16 }))).toThrow(
      UnsupportedPngError,
    );
    expect(() => decodePng(Buffer.from('not a png at all, definitely not'))).toThrow(
      UnsupportedPngError,
    );
  });

  it('reads size from IHDR', () => {
    expect(readPngSize(encodePng(9, 4, 3, 2, noise(108, 6)))).toEqual({ width: 9, height: 4 });
  });
});

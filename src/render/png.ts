import { inflateSync } from 'node:zlib';

/**
 * Minimal in-process PNG reader for Chromium screenshots (8-bit, non-interlaced
 * gray / gray+alpha / RGB / RGBA). Avoids an ffprobe + ffmpeg rawvideo round
 * trip per render. Anything else throws {@link UnsupportedPngError} so callers
 * can fall back to ffmpeg.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class UnsupportedPngError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedPngError';
  }
}

export interface PngSize {
  width: number;
  height: number;
}

export interface DecodedPng extends PngSize {
  /** Tightly packed RGBA, 4 bytes per pixel. */
  rgba: Uint8Array;
}

interface Header extends PngSize {
  bitDepth: number;
  colorType: number;
  interlace: number;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function readHeader(buf: Buffer): Header {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new UnsupportedPngError('Not a PNG file');
  }
  if (buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new UnsupportedPngError('PNG is missing IHDR');
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
    interlace: buf[28],
  };
}

/** Width/height from the IHDR chunk without decoding pixels. */
export function readPngSize(buf: Buffer): PngSize {
  const { width, height } = readHeader(buf);
  return { width, height };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buf: Buffer): DecodedPng {
  const header = readHeader(buf);
  const { width, height, bitDepth, colorType, interlace } = header;
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || channels === undefined || interlace !== 0) {
    throw new UnsupportedPngError(
      `Unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`,
    );
  }
  if (width < 1 || height < 1) throw new UnsupportedPngError('PNG has zero size');

  const idat: Buffer[] = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const start = off + 8;
    const end = start + len;
    if (end + 4 > buf.length) throw new UnsupportedPngError('Truncated PNG chunk');
    if (type === 'IDAT') idat.push(buf.subarray(start, end));
    else if (type === 'IEND') break;
    off = end + 4; // skip CRC
  }
  if (idat.length === 0) throw new UnsupportedPngError('PNG has no IDAT');

  const raw = inflateSync(idat.length === 1 ? idat[0] : Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new UnsupportedPngError('Short PNG image data');

  // Unfilter in place into `pixels` (one scanline at a time, bpp = channels).
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= channels ? pixels[dst + i - channels] : 0;
      const b = y > 0 ? pixels[prev + i] : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4:
          v = x + paeth(a, b, i >= channels && y > 0 ? pixels[prev + i - channels] : 0);
          break;
        default:
          throw new UnsupportedPngError(`Bad PNG filter type ${filter}`);
      }
      pixels[dst + i] = v & 0xff;
    }
  }

  if (channels === 4) return { width, height, rgba: pixels };

  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0, s = 0; p < rgba.length; p += 4, s += channels) {
    if (channels === 3) {
      rgba[p] = pixels[s];
      rgba[p + 1] = pixels[s + 1];
      rgba[p + 2] = pixels[s + 2];
      rgba[p + 3] = 255;
    } else {
      const g = pixels[s];
      rgba[p] = g;
      rgba[p + 1] = g;
      rgba[p + 2] = g;
      rgba[p + 3] = channels === 2 ? pixels[s + 1] : 255;
    }
  }
  return { width, height, rgba };
}

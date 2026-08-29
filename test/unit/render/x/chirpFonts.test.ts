import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHIRP_FACES,
  chirpFontFaceCss,
  ensureChirpFonts,
  injectChirpFontCss,
} from '../../../../src/render/x/chirpFonts.js';

function fakeWoff2(size = 2048): Buffer {
  return Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(size, 1)]);
}

function writeFace(dir: string, file: string, bytes: Buffer): void {
  writeFileSync(join(dir, file), bytes);
}

describe('chirpFontFaceCss', () => {
  it('emits data-URI faces with swap + latin unicode-range', () => {
    const regular = fakeWoff2();
    const bold = fakeWoff2();
    const css = chirpFontFaceCss([
      {
        file: CHIRP_FACES[0].file,
        weight: 400,
        unicodeRange: CHIRP_FACES[0].unicodeRange,
        bytes: regular,
      },
      {
        file: CHIRP_FACES[1].file,
        weight: 700,
        unicodeRange: CHIRP_FACES[1].unicodeRange,
        bytes: bold,
      },
    ]);
    expect(css).toContain('font-family: TwitterChirp');
    expect(css).toContain(`url("data:font/woff2;base64,${regular.toString('base64')}")`);
    expect(css).toContain(`url("data:font/woff2;base64,${bold.toString('base64')}")`);
    expect(css).toContain('font-weight: 400');
    expect(css).toContain('font-weight: 700');
    expect(css).toContain('font-display: swap');
    expect(css).toContain('unicode-range:');
    expect(css).toContain('U+0000-00FF');
    expect(css).not.toMatch(/font-weight:\s*500/);
    expect(css).not.toContain('./Chirp-');
  });
});

describe('injectChirpFontCss', () => {
  it('prepends @font-face into the first style block', () => {
    const html = '<style>\n  body { color: #fff }\n</style>';
    const out = injectChirpFontCss(html, '  @font-face { font-family: TwitterChirp; }');
    expect(out.indexOf('@font-face')).toBeGreaterThan(out.indexOf('<style>'));
    expect(out.indexOf('@font-face')).toBeLessThan(out.indexOf('body'));
  });
});

describe('ensureChirpFonts', () => {
  let cacheDir = '';
  let fallbackDir = '';

  afterEach(() => {
    if (cacheDir) {
      try {
        chmodSync(cacheDir, 0o755);
      } catch {
        // already gone
      }
      rmSync(cacheDir, { recursive: true, force: true });
    }
    if (fallbackDir) rmSync(fallbackDir, { recursive: true, force: true });
    cacheDir = '';
    fallbackDir = '';
  });

  it('downloads missing faces into hashed filenames and skips valid cache', async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'chirp-'));
    const downloadFn = vi.fn(async (url: string, dest: string) => {
      expect(CHIRP_FACES.some((f) => f.url === url)).toBe(true);
      writeFileSync(dest, fakeWoff2());
    });

    const first = await ensureChirpFonts({ cacheDir, downloadFn });
    expect(first).toHaveLength(2);
    expect(downloadFn).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(cacheDir, CHIRP_FACES[0].file)).subarray(0, 4).toString()).toBe(
      'wOF2',
    );
    expect(readFileSync(join(cacheDir, CHIRP_FACES[1].file)).subarray(0, 4).toString()).toBe(
      'wOF2',
    );

    downloadFn.mockClear();
    const second = await ensureChirpFonts({ cacheDir, downloadFn });
    expect(downloadFn).not.toHaveBeenCalled();
    expect(second[0]?.bytes.equals(first[0]?.bytes ?? Buffer.alloc(0))).toBe(true);
  });

  it('coalesces concurrent downloads of the same face', async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'chirp-'));
    const downloadFn = vi.fn(async (_url: string, dest: string) => {
      await new Promise((r) => setTimeout(r, 20));
      writeFileSync(dest, fakeWoff2());
    });

    await Promise.all([
      ensureChirpFonts({ cacheDir, downloadFn }),
      ensureChirpFonts({ cacheDir, downloadFn }),
    ]);
    expect(downloadFn).toHaveBeenCalledTimes(2);
  });

  it('re-fetches a cached file that is not a woff2', async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'chirp-'));
    writeFace(cacheDir, CHIRP_FACES[0].file, Buffer.from('not a font'));
    writeFace(cacheDir, CHIRP_FACES[1].file, fakeWoff2());
    const downloadFn = vi.fn(async (url: string, dest: string) => {
      expect(url).toBe(CHIRP_FACES[0].url);
      writeFileSync(dest, fakeWoff2());
    });

    await ensureChirpFonts({ cacheDir, downloadFn });
    expect(downloadFn).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(cacheDir, CHIRP_FACES[0].file)).subarray(0, 4).toString()).toBe(
      'wOF2',
    );
  });

  it('rejects a download that is too small even with wOF2 magic', async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'chirp-'));
    const downloadFn = vi.fn(async (_url: string, dest: string) => {
      writeFileSync(dest, Buffer.from('wOF2'));
    });
    await expect(ensureChirpFonts({ cacheDir, downloadFn })).rejects.toThrow(/not a woff2/);
  });

  it('falls back when the preferred cache dir is not writable', async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'chirp-ro-'));
    fallbackDir = mkdtempSync(join(tmpdir(), 'chirp-fb-'));
    chmodSync(cacheDir, 0o555);
    const downloadFn = vi.fn(async (_url: string, dest: string) => {
      writeFileSync(dest, fakeWoff2());
    });

    const faces = await ensureChirpFonts({ cacheDir, fallbackDir, downloadFn });
    expect(faces).toHaveLength(2);
    expect(readFileSync(join(fallbackDir, CHIRP_FACES[0].file)).subarray(0, 4).toString()).toBe(
      'wOF2',
    );
  });
});

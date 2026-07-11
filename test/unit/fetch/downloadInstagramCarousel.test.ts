import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadInstagramCarousel } from '../../../src/fetch/downloadInstagramCarousel.js';
import type { CarouselEntry } from '../../../src/fetch/dumpInstagramCarousel.js';
import type { CarouselMusic } from '../../../src/fetch/extractInstagramMusic.js';

function fakeResponse(
  body: Buffer,
  opts: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  const status = opts.status ?? 200;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    statusText: opts.statusText ?? '',
    body: stream,
  };
}

function thumb(url: string, width?: number, height?: number) {
  return { url, width, height };
}

function entry(id: string, thumbnails: CarouselEntry['thumbnails']): CarouselEntry {
  return { id, thumbnails };
}

describe('downloadInstagramCarousel', () => {
  let outDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'ig-carousel-'));
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(outDir, { recursive: true, force: true });
  });

  it('downloads each entry as slide_NNN.ext and returns the SlideshowAssets shape', async () => {
    const entries = [
      entry('a', [thumb('https://cdn.instagram.com/a.jpg', 1080, 1080)]),
      entry('b', [thumb('https://cdn.instagram.com/b.jpg', 800, 800)]),
      entry('c', [thumb('https://cdn.instagram.com/c.jpg', 640, 640)]),
    ];
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(`body-${url}`)));

    const result = await downloadInstagramCarousel({
      entries,
      music: { duration: 30 },
      outDir,
    });

    expect(result.images).toHaveLength(3);
    expect(result.images[0]).toBe(join(outDir, 'images', 'slide_000.jpg'));
    expect(result.images[1]).toBe(join(outDir, 'images', 'slide_001.jpg'));
    expect(result.images[2]).toBe(join(outDir, 'images', 'slide_002.jpg'));
    expect(result.audio).toBeUndefined();
    expect(result.duration).toBe(30);
    expect(result.audioStartMs).toBeUndefined();
    for (const img of result.images) {
      expect(readFileSync(img, 'utf8')).toMatch(/^body-/);
    }
  });

  it('picks the largest thumbnail by width*height', async () => {
    const entries = [
      entry('a', [
        thumb('https://cdn.instagram.com/small.jpg', 320, 320),
        thumb('https://cdn.instagram.com/big.png', 1080, 1350),
        thumb('https://cdn.instagram.com/medium.jpg', 640, 640),
      ]),
    ];
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    const result = await downloadInstagramCarousel({
      entries,
      music: {} as CarouselMusic,
      outDir,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.instagram.com/big.png',
      expect.objectContaining({ headers: { Referer: 'https://www.instagram.com/' } }),
    );
    expect(result.images[0]).toBe(join(outDir, 'images', 'slide_000.png'));
  });

  it('downloads audio when music.url is present', async () => {
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    const result = await downloadInstagramCarousel({
      entries: [entry('a', [thumb('https://cdn.instagram.com/a.jpg', 1080, 1080)])],
      music: { url: 'https://cdn.instagram.com/audio.m4a', duration: 12.5, startTimeMs: 5000 },
      outDir,
    });

    expect(result.audio).toBe(join(outDir, 'audio.m4a'));
    expect(result.duration).toBe(12.5);
    expect(result.audioStartMs).toBe(5000);
    expect(readFileSync(result.audio as string, 'utf8')).toBe(
      'https://cdn.instagram.com/audio.m4a',
    );
  });

  it('does not download audio when music.url is absent', async () => {
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    const result = await downloadInstagramCarousel({
      entries: [entry('a', [thumb('https://cdn.instagram.com/a.jpg', 1080, 1080)])],
      music: { duration: 5 },
      outDir,
    });

    expect(result.audio).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends Referer: https://www.instagram.com/ on every fetch call', async () => {
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    await downloadInstagramCarousel({
      entries: [
        entry('a', [thumb('https://cdn.instagram.com/a.jpg', 1080, 1080)]),
        entry('b', [thumb('https://cdn.instagram.com/b.jpg', 1080, 1080)]),
      ],
      music: { url: 'https://cdn.instagram.com/track.mp3' },
      outDir,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      const opts = call[1] as { headers: Record<string, string> };
      expect(opts.headers.Referer).toBe('https://www.instagram.com/');
    }
  });

  it('detects .jpg and .png extensions from URLs', async () => {
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    const result = await downloadInstagramCarousel({
      entries: [
        entry('a', [thumb('https://cdn.instagram.com/photo.JPG', 1080, 1080)]),
        entry('b', [thumb('https://cdn.instagram.com/photo.png?igsh=1', 1080, 1080)]),
      ],
      music: {} as CarouselMusic,
      outDir,
    });

    expect(result.images[0]).toBe(join(outDir, 'images', 'slide_000.jpg'));
    expect(result.images[1]).toBe(join(outDir, 'images', 'slide_001.png'));
  });

  it('defaults to .jpg when the image URL has no extension', async () => {
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    const result = await downloadInstagramCarousel({
      entries: [entry('a', [thumb('https://cdn.instagram.com/noext', 1080, 1080)])],
      music: {} as CarouselMusic,
      outDir,
    });

    expect(result.images[0]).toBe(join(outDir, 'images', 'slide_000.jpg'));
  });

  it('defaults audio to .m4a when the URL has no extension', async () => {
    fetchMock.mockImplementation((url: string) => fakeResponse(Buffer.from(url)));

    const result = await downloadInstagramCarousel({
      entries: [entry('a', [thumb('https://cdn.instagram.com/a.jpg', 1080, 1080)])],
      music: { url: 'https://cdn.instagram.com/track' },
      outDir,
    });

    expect(result.audio).toBe(join(outDir, 'audio.m4a'));
  });

  it('throws a descriptive error on 403', async () => {
    fetchMock.mockImplementation(() =>
      fakeResponse(Buffer.from('forbidden'), { status: 403, statusText: 'Forbidden' }),
    );

    await expect(
      downloadInstagramCarousel({
        entries: [entry('a', [thumb('https://cdn.instagram.com/a.jpg', 1080, 1080)])],
        music: {} as CarouselMusic,
        outDir,
      }),
    ).rejects.toThrow(/403.*Referer/);
  });

  it('throws when an entry has no thumbnails', async () => {
    await expect(
      downloadInstagramCarousel({
        entries: [entry('a', [])],
        music: {} as CarouselMusic,
        outDir,
      }),
    ).rejects.toThrow(/no thumbnails/);
  });
});

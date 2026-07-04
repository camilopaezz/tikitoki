import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractCarouselFromDir,
  extractCarouselFromJson,
} from '../../../src/fetch/extractInstagramCarousel.js';

function carouselMediaItem(opts: {
  id?: string;
  mediaType?: number;
  candidates?: { url?: string; width?: number; height?: number }[];
  videoVersions?: unknown[];
}) {
  return {
    id: opts.id ?? '0',
    pk: opts.id ?? '0',
    media_type: opts.mediaType ?? 1,
    image_versions2: {
      candidates: opts.candidates ?? [{ url: 'https://cdn/x.jpg', width: 1080, height: 1080 }],
    },
    video_versions: opts.videoVersions ?? [],
  };
}

function apiResponse(carousel: object[]): string {
  return JSON.stringify({
    num_results: 1,
    more_available: false,
    status: 'ok',
    items: [{ id: 'post', pk: 'post', media_type: 8, carousel_media: carousel }],
  });
}

describe('extractCarouselFromJson', () => {
  it('extracts image candidates from carousel_media', () => {
    const raw = apiResponse([
      carouselMediaItem({
        id: 'a',
        candidates: [
          { url: 'https://cdn/a_large.jpg', width: 1080, height: 1350 },
          { url: 'https://cdn/a_small.jpg', width: 320, height: 400 },
        ],
      }),
      carouselMediaItem({
        id: 'b',
        candidates: [{ url: 'https://cdn/b.jpg', width: 800, height: 800 }],
      }),
    ]);

    const items = extractCarouselFromJson(raw);

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('a');
    expect(items[0].hasVideo).toBe(false);
    expect(items[0].candidates).toHaveLength(2);
    expect(items[0].candidates[0].url).toBe('https://cdn/a_large.jpg');
    expect(items[0].candidates[0].width).toBe(1080);
    expect(items[1].id).toBe('b');
    expect(items[1].candidates).toHaveLength(1);
  });

  it('marks entries with media_type 2 as video', () => {
    const raw = apiResponse([
      carouselMediaItem({ id: 'img', mediaType: 1 }),
      carouselMediaItem({ id: 'vid', mediaType: 2 }),
    ]);

    const items = extractCarouselFromJson(raw);

    expect(items[0].hasVideo).toBe(false);
    expect(items[1].hasVideo).toBe(true);
  });

  it('marks entries with video_versions as video regardless of media_type', () => {
    const raw = apiResponse([
      carouselMediaItem({ id: 'vid', mediaType: 1, videoVersions: [{ url: 'https://cdn/v.mp4' }] }),
    ]);

    const items = extractCarouselFromJson(raw);

    expect(items[0].hasVideo).toBe(true);
  });

  it('filters out candidates without a url', () => {
    const raw = apiResponse([
      carouselMediaItem({
        id: 'a',
        candidates: [
          { url: 'https://cdn/a.jpg', width: 1080 },
          { width: 100 },
          { url: 'https://cdn/a2.jpg' },
        ],
      }),
    ]);

    const items = extractCarouselFromJson(raw);

    expect(items[0].candidates).toHaveLength(2);
    expect(items[0].candidates[0].url).toBe('https://cdn/a.jpg');
    expect(items[0].candidates[1].url).toBe('https://cdn/a2.jpg');
  });

  it('falls back to pk when id is missing', () => {
    const raw = apiResponse([
      carouselMediaItem({
        id: undefined as unknown as string,
        candidates: [{ url: 'https://cdn/x.jpg' }],
      }),
    ]);

    const items = extractCarouselFromJson(raw);

    expect(items[0].id).toBe('0');
  });

  it('returns empty array when items is missing', () => {
    const items = extractCarouselFromJson(JSON.stringify({ status: 'ok' }));
    expect(items).toEqual([]);
  });

  it('returns empty array when no item has carousel_media', () => {
    const raw = JSON.stringify({ items: [{ id: 'x', media_type: 1 }] });
    expect(extractCarouselFromJson(raw)).toEqual([]);
  });

  it('returns empty array on malformed JSON', () => {
    expect(extractCarouselFromJson('not json')).toEqual([]);
  });

  it('skips items with empty carousel_media and continues to the next', () => {
    const raw = JSON.stringify({
      items: [
        { id: 'first', media_type: 8, carousel_media: [] },
        {
          id: 'second',
          media_type: 8,
          carousel_media: [
            carouselMediaItem({ id: 'a', candidates: [{ url: 'https://cdn/a.jpg' }] }),
          ],
        },
      ],
    });

    const items = extractCarouselFromJson(raw);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('a');
  });
});

describe('extractCarouselFromDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ig-carousel-dir-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads .dump files and returns carousel items', () => {
    writeFileSync(
      join(dir, 'post.dump'),
      apiResponse([carouselMediaItem({ id: 'a' }), carouselMediaItem({ id: 'b' })]),
    );

    const items = extractCarouselFromDir(dir);

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('a');
  });

  it('returns the first non-empty result across multiple dump files', () => {
    writeFileSync(
      join(dir, 'empty.dump'),
      JSON.stringify({ items: [{ media_type: 8, carousel_media: [] }] }),
    );
    writeFileSync(join(dir, 'good.dump'), apiResponse([carouselMediaItem({ id: 'x' })]));

    const items = extractCarouselFromDir(dir);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('x');
  });

  it('returns empty array when no dump files exist', () => {
    writeFileSync(join(dir, 'notdump.txt'), apiResponse([carouselMediaItem({ id: 'a' })]));

    expect(extractCarouselFromDir(dir)).toEqual([]);
  });

  it('returns empty array when the directory does not exist', () => {
    expect(extractCarouselFromDir(join(dir, 'nope'))).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runYtDlp = vi.fn();
const extractCarouselFromDir = vi.fn();

vi.mock('../../../src/process/ytDlp.js', () => ({
  runYtDlp: (...args: unknown[]) => runYtDlp(...args),
}));
vi.mock('../../../src/fetch/extractInstagramCarousel.js', () => ({
  extractCarouselFromDir: (...args: unknown[]) => extractCarouselFromDir(...args),
}));

import { AuthFailureError } from '../../../src/fetch/authFailure.js';
import {
  type CarouselMetadata,
  dumpInstagramCarousel,
  MixedCarouselError,
  SingleImageError,
} from '../../../src/fetch/dumpInstagramCarousel.js';
import type { CarouselItem } from '../../../src/fetch/extractInstagramCarousel.js';

function imageItem(id: string, candidates = 1): CarouselItem {
  return {
    id,
    hasVideo: false,
    candidates: Array.from({ length: candidates }, (_, i) => ({
      url: `https://cdn.example.com/${id}_${i}.jpg`,
      width: 1080,
      height: 1080,
    })),
  };
}

function videoItem(id: string): CarouselItem {
  return {
    id,
    hasVideo: true,
    candidates: [{ url: `https://cdn.example.com/${id}.jpg`, width: 1080, height: 1080 }],
  };
}

describe('dumpInstagramCarousel', () => {
  beforeEach(() => {
    runYtDlp.mockReset();
    extractCarouselFromDir.mockReset();
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('returns image-only carousel metadata', async () => {
    extractCarouselFromDir.mockReturnValue([imageItem('a'), imageItem('b'), imageItem('c')]);

    const result = await dumpInstagramCarousel({
      url: 'https://www.instagram.com/p/ABC/',
      pagesDir: '/tmp/pages',
    });

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].id).toBe('a');
    expect(result.entries[0].thumbnails[0].url).toBe('https://cdn.example.com/a_0.jpg');
    expect(result.entries[2].id).toBe('c');
  });

  it('throws MixedCarouselError when any entry has video formats', async () => {
    extractCarouselFromDir.mockReturnValue([imageItem('a'), videoItem('b')]);

    await expect(
      dumpInstagramCarousel({
        url: 'https://www.instagram.com/p/ABC/',
        pagesDir: '/tmp/pages',
      }),
    ).rejects.toBeInstanceOf(MixedCarouselError);
  });

  it('throws SingleImageError when only one entry is returned', async () => {
    extractCarouselFromDir.mockReturnValue([imageItem('a')]);

    await expect(
      dumpInstagramCarousel({
        url: 'https://www.instagram.com/p/ABC/',
        pagesDir: '/tmp/pages',
      }),
    ).rejects.toBeInstanceOf(SingleImageError);
  });

  it('throws MixedCarouselError before SingleImageError for a single video entry', async () => {
    extractCarouselFromDir.mockReturnValue([videoItem('solo')]);

    await expect(
      dumpInstagramCarousel({
        url: 'https://www.instagram.com/p/ABC/',
        pagesDir: '/tmp/pages',
      }),
    ).rejects.toBeInstanceOf(MixedCarouselError);
  });

  it('throws AuthFailureError on auth-failure stderr', async () => {
    runYtDlp.mockRejectedValue(new Error('Instagram said: empty media response'));
    extractCarouselFromDir.mockReturnValue([]);

    await expect(
      dumpInstagramCarousel({
        url: 'https://www.instagram.com/p/ABC/',
        pagesDir: '/tmp/pages',
      }),
    ).rejects.toBeInstanceOf(AuthFailureError);
  });

  it('rethrows non-auth errors unchanged', async () => {
    runYtDlp.mockRejectedValue(new Error('HTTP Error 404: Not Found'));
    extractCarouselFromDir.mockReturnValue([]);

    await expect(
      dumpInstagramCarousel({
        url: 'https://www.instagram.com/p/ABC/',
        pagesDir: '/tmp/pages',
      }),
    ).rejects.toThrow('HTTP Error 404: Not Found');
  });

  it('passes -J --write-pages --no-download --ignore-no-formats-error, cookies, and pagesDir cwd to runYtDlp', async () => {
    extractCarouselFromDir.mockReturnValue([imageItem('a'), imageItem('b')]);

    await dumpInstagramCarousel({
      url: 'https://www.instagram.com/p/ABC/',
      cookiesPath: '/data/ig.txt',
      pagesDir: '/tmp/pages',
      jobId: 'job-1',
    });

    expect(runYtDlp).toHaveBeenCalledWith(
      expect.arrayContaining([
        '-J',
        '--write-pages',
        '--no-download',
        '--ignore-no-formats-error',
        '--cookies',
        '/data/ig.txt',
        'https://www.instagram.com/p/ABC/',
      ]),
      expect.objectContaining({ cwd: '/tmp/pages', jobId: 'job-1' }),
    );
  });

  it('works without cookies when cookiesPath is omitted', async () => {
    extractCarouselFromDir.mockReturnValue([imageItem('a'), imageItem('b')]);

    const result = await dumpInstagramCarousel({
      url: 'https://www.instagram.com/p/ABC/',
      pagesDir: '/tmp/pages',
    });

    const args = runYtDlp.mock.calls[0][0] as string[];
    expect(args).not.toContain('--cookies');
    expect(result.entries).toHaveLength(2);
  });

  it('throws on an empty carousel', async () => {
    extractCarouselFromDir.mockReturnValue([]);

    await expect(
      dumpInstagramCarousel({
        url: 'https://www.instagram.com/p/ABC/',
        pagesDir: '/tmp/pages',
      }),
    ).rejects.toThrow(/no entries/);
  });

  it('maps extractor candidates onto entry thumbnails', async () => {
    extractCarouselFromDir.mockReturnValue([
      {
        id: 'a',
        hasVideo: false,
        candidates: [
          { url: 'https://cdn.example.com/a_large.jpg', width: 1080, height: 1350 },
          { url: 'https://cdn.example.com/a_small.jpg', width: 320, height: 400 },
        ],
      },
      imageItem('b'),
    ]);

    const result: CarouselMetadata = await dumpInstagramCarousel({
      url: 'https://www.instagram.com/p/ABC/',
      pagesDir: '/tmp/pages',
    });

    expect(result.entries[0].thumbnails).toHaveLength(2);
    expect(result.entries[0].thumbnails[0].url).toBe('https://cdn.example.com/a_large.jpg');
  });
});

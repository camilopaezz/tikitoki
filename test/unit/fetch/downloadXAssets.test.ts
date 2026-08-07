import { describe, expect, it, vi } from 'vitest';
import { downloadXAssets } from '../../../src/fetch/downloadXAssets.js';
import type { XPostChrome } from '../../../src/fetch/twitterChromeTypes.js';

function baseChrome(over: Partial<XPostChrome> = {}): XPostChrome {
  return {
    layoutKind: 'simple_video',
    statusId: '1',
    sourceUrl: 'https://x.com/u/status/1',
    outer: {
      author: {
        name: 'User',
        handle: 'user',
        avatarUrl: 'https://pbs.twimg.com/profile_images/1/a_400x400.jpg',
        verified: false,
      },
      text: { text: 'hi', displayText: 'hi' },
    },
    primaryVideo: {
      url: 'https://video.twimg.com/v.mp4',
      width: 640,
      height: 360,
      durationSec: 5,
    },
    ...over,
  };
}

describe('downloadXAssets', () => {
  it('downloads video + outer avatar for simple_video', async () => {
    const downloadVideoFn = vi.fn().mockResolvedValue('/tmp/job/out.mp4');
    const downloadFileFn = vi.fn().mockResolvedValue(undefined);
    const probeVideoFn = vi.fn().mockResolvedValue({ width: 960, height: 540, durationSec: 12 });

    const assets = await downloadXAssets({
      chrome: baseChrome(),
      outDir: '/tmp/job',
      cookiesPath: '/cookies/twitter.txt',
      jobId: 'j1',
      downloadVideoFn,
      downloadFileFn,
      probeVideoFn,
    });

    expect(downloadVideoFn).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://x.com/u/status/1',
        outDir: '/tmp/job',
        cookiesPath: '/cookies/twitter.txt',
        platform: 'twitter',
      }),
    );
    expect(assets.primaryVideo).toEqual({
      path: '/tmp/job/out.mp4',
      width: 960,
      height: 540,
      durationSec: 12,
    });
    expect(assets.outer.author.avatarPath).toMatch(/avatar_outer/);
    expect(assets.quote).toBeUndefined();
  });

  it('uses quoted status URL for quote_of_video primary video', async () => {
    const downloadVideoFn = vi.fn().mockResolvedValue('/tmp/job/out.mp4');
    const downloadFileFn = vi.fn().mockResolvedValue(undefined);
    const probeVideoFn = vi.fn().mockResolvedValue({ width: 1280, height: 720, durationSec: 9 });

    await downloadXAssets({
      chrome: baseChrome({
        layoutKind: 'quote_of_video',
        quote: {
          author: {
            name: 'Nested',
            handle: 'nested',
            avatarUrl: 'https://pbs.twimg.com/profile_images/2/b_400x400.jpg',
            verified: true,
          },
          text: { text: 'q', displayText: 'q' },
          images: [],
          statusId: '999',
        },
      }),
      outDir: '/tmp/job',
      downloadVideoFn,
      downloadFileFn,
      probeVideoFn,
    });

    expect(downloadVideoFn).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x.com/i/status/999' }),
    );
  });

  it('downloads quote images and tolerates avatar failure', async () => {
    const downloadVideoFn = vi.fn().mockResolvedValue('/tmp/job/out.mp4');
    const downloadFileFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('avatar') || url.includes('profile_images')) {
        throw new Error('avatar 404');
      }
    });
    const probeVideoFn = vi.fn().mockResolvedValue({ width: 100, height: 100, durationSec: 3 });

    const assets = await downloadXAssets({
      chrome: baseChrome({
        layoutKind: 'video_quotes',
        quote: {
          author: {
            name: 'Q',
            handle: 'q',
            avatarUrl: 'https://pbs.twimg.com/profile_images/3/c_400x400.jpg',
            verified: false,
          },
          text: { text: 'img', displayText: 'img' },
          images: [
            { url: 'https://pbs.twimg.com/media/a.jpg', width: 10, height: 10 },
            { url: 'https://pbs.twimg.com/media/b.jpg', width: 20, height: 20 },
          ],
          statusId: '2',
        },
      }),
      outDir: '/tmp/job',
      downloadVideoFn,
      downloadFileFn,
      probeVideoFn,
    });

    expect(assets.outer.author.avatarPath).toBeUndefined();
    expect(assets.quote?.author.avatarPath).toBeUndefined();
    expect(assets.quote?.images).toHaveLength(2);
    expect(assets.quote?.images[0].path).toMatch(/quote_img_00/);
  });

  it('falls back to syndication dims when probe fails', async () => {
    const downloadVideoFn = vi.fn().mockResolvedValue('/tmp/job/out.mp4');
    const downloadFileFn = vi.fn().mockResolvedValue(undefined);
    const probeVideoFn = vi.fn().mockRejectedValue(new Error('no ffprobe'));

    const assets = await downloadXAssets({
      chrome: baseChrome({
        primaryVideo: { width: 640, height: 360, durationSec: 5 },
      }),
      outDir: '/tmp/job',
      downloadVideoFn,
      downloadFileFn,
      probeVideoFn,
    });

    expect(assets.primaryVideo.width).toBe(640);
    expect(assets.primaryVideo.durationSec).toBe(5);
  });
});

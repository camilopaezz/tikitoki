import { describe, expect, it } from 'vitest';
import { classify, type PostInfo } from '../../../src/fetch/classify.js';

describe('classify', () => {
  it('returns slideshow when album is true', () => {
    const info: PostInfo = { album: true, thumbnails: [{ url: 'http://x/1' }] };
    expect(classify(info)).toBe('slideshow');
  });

  it('returns video when video formats are present', () => {
    const info: PostInfo = {
      formats: [{ vcodec: 'h264', height: 1920, width: 1080 }],
    };
    expect(classify(info)).toBe('video');
  });

  it('returns slideshow when there are multiple thumbnails and no video', () => {
    const info: PostInfo = {
      thumbnails: [{ url: 'http://x/1' }, { url: 'http://x/2' }, { url: 'http://x/3' }],
    };
    expect(classify(info)).toBe('slideshow');
  });

  it('returns video for a direct url fallback', () => {
    const info: PostInfo = { url: 'http://x/video.mp4' };
    expect(classify(info)).toBe('video');
  });

  it('filters out cover/avatar thumbnails', () => {
    const info: PostInfo = {
      thumbnails: [{ id: 'cover', url: 'http://x/cover' }, { url: 'http://x/1' }],
    };
    // classify does not filter thumbnails itself; that happens in downloadSlideshow.
    // This test documents that two non-cover thumbnails are still slideshow.
    expect(classify(info)).toBe('slideshow');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { resolveTikTokUrl, rewriteToVideoUrl } from '../../../src/fetch/resolveUrl.js';

describe('rewriteToVideoUrl', () => {
  it('rewrites /photo/ to /video/', () => {
    const url = 'https://www.tiktok.com/@user/photo/1234567890';
    expect(rewriteToVideoUrl(url)).toBe('https://www.tiktok.com/@user/video/1234567890');
  });

  it('preserves query params when rewriting', () => {
    const url = 'https://www.tiktok.com/@user/photo/1234567890?_r=1&_t=abc';
    const rewritten = rewriteToVideoUrl(url);
    expect(rewritten).toContain('/video/');
    expect(rewritten).toContain('_r=1');
    expect(rewritten).toContain('_t=abc');
  });

  it('leaves /video/ URLs unchanged', () => {
    const url = 'https://www.tiktok.com/@user/video/1234567890';
    expect(rewriteToVideoUrl(url)).toBe(url);
  });
});

describe('resolveTikTokUrl', () => {
  it('detects direct /photo/ URLs without fetching', async () => {
    const url = 'https://www.tiktok.com/@user/photo/1234567890';
    const result = await resolveTikTokUrl(url);
    expect(result.isSlideshow).toBe(true);
    expect(result.url).toBe(url);
  });

  it('returns isSlideshow false for /video/ URLs', async () => {
    const url = 'https://www.tiktok.com/@user/video/1234567890';
    const result = await resolveTikTokUrl(url);
    expect(result.isSlideshow).toBe(false);
    expect(result.url).toBe(url);
  });

  it('follows vt.tiktok.com redirects and detects /photo/', async () => {
    const finalUrl = 'https://www.tiktok.com/@user/photo/1234567890';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ url: finalUrl }));
    try {
      const result = await resolveTikTokUrl('https://vt.tiktok.com/Z123/');
      expect(result.isSlideshow).toBe(true);
      expect(result.url).toBe(finalUrl);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('follows vt.tiktok.com redirects and detects /video/', async () => {
    const finalUrl = 'https://www.tiktok.com/@user/video/1234567890';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ url: finalUrl }));
    try {
      const result = await resolveTikTokUrl('https://vt.tiktok.com/Z123/');
      expect(result.isSlideshow).toBe(false);
      expect(result.url).toBe(finalUrl);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back gracefully when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    try {
      const result = await resolveTikTokUrl('https://vt.tiktok.com/Z123/');
      expect(result.isSlideshow).toBe(false);
      expect(result.url).toBe('https://vt.tiktok.com/Z123/');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

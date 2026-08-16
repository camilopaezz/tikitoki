import { describe, expect, it } from 'vitest';
import { isTikTokUrl, refererArgs, TIKTOK_REFERER } from '../../../src/fetch/referer.js';

describe('isTikTokUrl', () => {
  it.each([
    'https://www.tiktok.com/@u/video/1',
    'https://tiktok.com/@u/video/1',
    'https://vt.tiktok.com/ZSabc/',
    'https://vm.tiktok.com/ZSabc/',
    'https://m.tiktok.com/v/1.html',
  ])('detects %s', (url) => {
    expect(isTikTokUrl(url)).toBe(true);
  });

  it.each([
    'https://www.instagram.com/reel/abc/',
    'https://x.com/user/status/1',
    'https://twitter.com/user/status/1',
    'https://nottiktok.com/video/1',
    'https://example.com/?q=tiktok.com',
  ])('rejects %s', (url) => {
    expect(isTikTokUrl(url)).toBe(false);
  });
});

describe('refererArgs', () => {
  it('adds --referer for TikTok URLs', () => {
    expect(refererArgs('https://www.tiktok.com/@u/video/1')).toEqual(['--referer', TIKTOK_REFERER]);
  });

  it('returns no args for non-TikTok URLs', () => {
    expect(refererArgs('https://www.instagram.com/reel/abc/')).toEqual([]);
    expect(refererArgs('https://x.com/user/status/1')).toEqual([]);
  });
});

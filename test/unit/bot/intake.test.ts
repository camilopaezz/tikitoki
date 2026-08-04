import { describe, expect, it } from 'vitest';
import { extractPostUrl, USAGE_MESSAGE } from '../../../src/bot/intake.js';

describe('extractPostUrl', () => {
  describe('TikTok URLs', () => {
    it('matches a canonical www.tiktok.com video URL', () => {
      const url = 'https://www.tiktok.com/@user/video/123';
      expect(extractPostUrl(url)).toBe(url);
    });

    it('matches a vt.tiktok.com short URL', () => {
      const url = 'https://vt.tiktok.com/ZSCVNuK44/';
      expect(extractPostUrl(url)).toBe(url);
    });
  });

  describe('Instagram URLs', () => {
    it('matches a /p/ carousel URL', () => {
      const url = 'https://www.instagram.com/p/DZx_kFmGLwy/';
      expect(extractPostUrl(url)).toBe(url);
    });

    it('matches a /reel/ URL', () => {
      const url = 'https://www.instagram.com/reel/DYXQG03PTPI/';
      expect(extractPostUrl(url)).toBe(url);
    });

    it('matches a /reels/ URL', () => {
      const url = 'https://www.instagram.com/reels/DYXQG03PTPI/';
      expect(extractPostUrl(url)).toBe(url);
    });
  });

  describe('Twitter/X URLs', () => {
    it('matches an x.com status URL', () => {
      const url = 'https://x.com/user/status/1234567890';
      expect(extractPostUrl(url)).toBe(url);
    });

    it('matches a twitter.com status URL', () => {
      const url = 'https://twitter.com/user/status/1234567890';
      expect(extractPostUrl(url)).toBe(url);
    });

    it('matches a www.x.com status URL', () => {
      const url = 'https://www.x.com/user/status/99';
      expect(extractPostUrl(url)).toBe(url);
    });

    it('matches an x.com/i/status URL without a username', () => {
      const url = 'https://x.com/i/status/2084391060336259405';
      expect(extractPostUrl(url)).toBe(url);
    });
  });

  it('extracts the URL from surrounding text', () => {
    const url = 'https://www.instagram.com/reel/DYXQG03PTPI/';
    expect(extractPostUrl(`check this out: ${url} pretty cool`)).toBe(url);
  });

  it('returns undefined for non-matching text', () => {
    expect(extractPostUrl('hello there')).toBeUndefined();
  });

  it('returns undefined for empty text', () => {
    expect(extractPostUrl('')).toBeUndefined();
  });

  it('returns undefined for unrelated URLs', () => {
    expect(extractPostUrl('https://example.com/foo')).toBeUndefined();
  });
});

describe('USAGE_MESSAGE', () => {
  it('mentions TikTok, Instagram, and Twitter/X', () => {
    expect(USAGE_MESSAGE).toMatch(/tiktok/i);
    expect(USAGE_MESSAGE).toMatch(/instagram/i);
    expect(USAGE_MESSAGE).toMatch(/twitter|x/i);
  });
});

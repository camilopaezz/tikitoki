import { describe, expect, it } from 'vitest';
import { resolveInstagramUrl } from '../../../src/fetch/resolveInstagramUrl.js';

describe('resolveInstagramUrl', () => {
  describe('/p/ URLs', () => {
    it('detects a carousel post', async () => {
      const url = 'https://www.instagram.com/p/DZx_kFmGLwy/';
      const result = await resolveInstagramUrl(url);
      expect(result.isCarousel).toBe(true);
      expect(result.isReel).toBe(false);
      expect(result.url).toBe(url);
    });

    it('strips query params from a /p/ URL', async () => {
      const url = 'https://www.instagram.com/p/DZx_kFmGLwy/?img_index=4&igsh=abc123';
      const result = await resolveInstagramUrl(url);
      expect(result.isCarousel).toBe(true);
      expect(result.isReel).toBe(false);
      expect(result.url).toBe('https://www.instagram.com/p/DZx_kFmGLwy/');
    });

    it('strips utm_* query params', async () => {
      const url =
        'https://www.instagram.com/p/DZx_kFmGLwy/?utm_source=share&utm_medium=ig_web&igshid=xyz';
      const result = await resolveInstagramUrl(url);
      expect(result.url).toBe('https://www.instagram.com/p/DZx_kFmGLwy/');
      expect(result.isCarousel).toBe(true);
    });
  });

  describe('/reel/ URLs', () => {
    it('detects a reel', async () => {
      const url = 'https://www.instagram.com/reel/DYXQG03PTPI/';
      const result = await resolveInstagramUrl(url);
      expect(result.isReel).toBe(true);
      expect(result.isCarousel).toBe(false);
      expect(result.url).toBe(url);
    });

    it('strips query params from a /reel/ URL', async () => {
      const url = 'https://www.instagram.com/reel/DYXQG03PTPI/?igsh=abc&igshid=def';
      const result = await resolveInstagramUrl(url);
      expect(result.isReel).toBe(true);
      expect(result.isCarousel).toBe(false);
      expect(result.url).toBe('https://www.instagram.com/reel/DYXQG03PTPI/');
    });
  });

  describe('/reels/ URLs', () => {
    it('detects a reel (plural form)', async () => {
      const url = 'https://www.instagram.com/reels/DYXQG03PTPI/';
      const result = await resolveInstagramUrl(url);
      expect(result.isReel).toBe(true);
      expect(result.isCarousel).toBe(false);
      expect(result.url).toBe(url);
    });

    it('strips query params from a /reels/ URL', async () => {
      const url = 'https://www.instagram.com/reels/DYXQG03PTPI/?img_index=1&utm_source=web';
      const result = await resolveInstagramUrl(url);
      expect(result.isReel).toBe(true);
      expect(result.isCarousel).toBe(false);
      expect(result.url).toBe('https://www.instagram.com/reels/DYXQG03PTPI/');
    });
  });

  describe('invalid URL handling', () => {
    it('falls back to string matching for a non-URL input', async () => {
      const input = 'not a url at all';
      const result = await resolveInstagramUrl(input);
      expect(result.url).toBe(input);
      expect(result.isCarousel).toBe(false);
      expect(result.isReel).toBe(false);
    });

    it('returns false for both flags on an unrelated Instagram URL', async () => {
      const url = 'https://www.instagram.com/someuser/';
      const result = await resolveInstagramUrl(url);
      expect(result.isCarousel).toBe(false);
      expect(result.isReel).toBe(false);
      expect(result.url).toBe(url);
    });
  });
});

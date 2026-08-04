import { describe, expect, it } from 'vitest';
import { detectNoVideo, NoVideoError } from '../../../src/fetch/noVideo.js';

describe('NoVideoError', () => {
  it('has a stable default message', () => {
    const err = new NoVideoError();
    expect(err.name).toBe('NoVideoError');
    expect(err.message).toMatch(/downloadable video/i);
  });
});

describe('detectNoVideo', () => {
  it('detects yt-dlp "No video could be found in this tweet"', () => {
    expect(detectNoVideo('ERROR: [twitter] 123: No video could be found in this tweet')).toBe(true);
  });

  it('detects "No video formats found"', () => {
    expect(detectNoVideo('ERROR: No video formats found')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(detectNoVideo('ERROR: HTTP Error 404: Not Found')).toBe(false);
  });
});

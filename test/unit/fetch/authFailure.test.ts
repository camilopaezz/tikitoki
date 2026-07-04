import { describe, expect, it } from 'vitest';
import { detectAuthFailure } from '../../../src/fetch/authFailure.js';

describe('detectAuthFailure', () => {
  it('detects the bot confirmation prompt', () => {
    const stderr = "ERROR: [tiktok] 12345: Sign in to confirm you're not a bot";
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('detects age confirmation prompt', () => {
    const stderr = 'Sign in to confirm your age';
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    const stderr = 'ERROR: Unable to download webpage: HTTP Error 404: Not Found';
    expect(detectAuthFailure(stderr)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { AuthFailureError, detectAuthFailure } from '../../../src/fetch/authFailure.js';

describe('AuthFailureError', () => {
  it('has a platform-agnostic default message', () => {
    const err = new AuthFailureError();
    expect(err.message).toBe('Authentication failed; cookies may need to be re-exported.');
    expect(err.name).toBe('AuthFailureError');
  });

  it('does not mention TikTok in the default message', () => {
    const err = new AuthFailureError();
    expect(err.message.toLowerCase()).not.toContain('tiktok');
  });

  it('accepts a custom message', () => {
    const err = new AuthFailureError('custom reason');
    expect(err.message).toBe('custom reason');
  });
});

describe('detectAuthFailure', () => {
  it('detects the TikTok bot confirmation prompt', () => {
    const stderr = "ERROR: [tiktok] 12345: Sign in to confirm you're not a bot";
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('detects TikTok age confirmation prompt', () => {
    const stderr = 'Sign in to confirm your age';
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('detects login required prompt', () => {
    const stderr = 'ERROR: [instagram] 12345: Login required';
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('detects Instagram "empty media response" message', () => {
    const stderr = 'ERROR: [instagram] 12345: Instagram said: empty media response';
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('detects Instagram "accessible in your browser without being logged-in" message', () => {
    const stderr =
      'ERROR: This content is accessible in your browser without being logged-in. Please provide credentials.';
    expect(detectAuthFailure(stderr)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    const stderr = 'ERROR: Unable to download webpage: HTTP Error 404: Not Found';
    expect(detectAuthFailure(stderr)).toBe(false);
  });

  it('returns false for empty stderr', () => {
    expect(detectAuthFailure('')).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  errorText,
  isPermanentHttpClientError,
  isTransientDownloadError,
  withOneRetry,
} from '../../../src/util/retry.js';

describe('errorText', () => {
  it('includes nested cause message and errno code', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:80'), {
      code: 'ECONNREFUSED',
    });
    const err = new TypeError('fetch failed', { cause });
    expect(errorText(err)).toMatch(/fetch failed/);
    expect(errorText(err)).toMatch(/ECONNREFUSED/);
  });
});

describe('isPermanentHttpClientError', () => {
  it.each([
    'ERROR: Unable to download webpage: HTTP Error 404: Not Found',
    'Process exited with code 1: ERROR: [twitter] Unable to download webpage: HTTP Error 403: Forbidden',
    'Failed to download https://cdn.example/a.jpg: 403 Forbidden',
    'Failed to download https://cdn.example/a.jpg: 404 Not Found',
  ])('detects permanent 4xx in %s', (msg) => {
    expect(isPermanentHttpClientError(new Error(msg))).toBe(true);
  });

  it('does not treat 429 as permanent', () => {
    expect(
      isPermanentHttpClientError(new Error('ERROR: Unable to download webpage: HTTP Error 429')),
    ).toBe(false);
  });
});

describe('isTransientDownloadError', () => {
  it.each([
    'ERROR: HTTP Error 429: Too Many Requests',
    'ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests',
    'Process exited with code 1: ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests',
    'rate limit exceeded',
    'Too Many Requests',
    'HTTP Error 503: Service Unavailable',
    'Failed to download https://cdn.example/a.jpg: 500 Internal Server Error',
    'Failed to download https://cdn.example/a.jpg: 429 Too Many Requests',
    'Connection timed out',
    'read ETIMEDOUT',
    'socket hang up',
    'Unable to download webpage: Temporary failure in name resolution',
    'temporarily unavailable',
    'network unreachable',
    'network error',
    'ERROR: [TikTok] 123: Unable to extract universal data for rehydration',
    'WARNING: [TikTok] The extractor is attempting impersonation, but no impersonate target is available',
    'ERROR: [TikTok] 123: Unexpected response from webpage request',
  ])('treats %s as transient', (msg) => {
    expect(isTransientDownloadError(new Error(msg))).toBe(true);
  });

  it('treats TypeError fetch failed with ECONNRESET cause as transient', () => {
    const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const err = new TypeError('fetch failed', { cause });
    expect(isTransientDownloadError(err)).toBe(true);
  });

  it.each([
    'ERROR: HTTP Error 404: Not Found',
    'ERROR: Unable to download webpage: HTTP Error 404: Not Found',
    'Process exited with code 1: ERROR: Unable to download webpage: HTTP Error 404: Not Found',
    'ERROR: Unable to download webpage: HTTP Error 403: Forbidden',
    'Failed to download https://cdn.example/a.jpg: 403 Forbidden',
    'Failed to download https://cdn.example/a.jpg: 404 Not Found',
    'No video could be found in this tweet',
    'login required',
    "Sign in to confirm you're not a bot",
  ])('treats %s as permanent', (msg) => {
    expect(isTransientDownloadError(new Error(msg))).toBe(false);
  });
});

describe('withOneRetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withOneRetry(fn, { delayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once after a transient failure and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP Error 429: Too Many Requests'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await expect(withOneRetry(fn, { delayMs: 0, onRetry })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not retry when isRetryable returns false', async () => {
    const err = new Error('login required');
    const fn = vi.fn().mockRejectedValue(err);
    const onRetry = vi.fn();

    await expect(
      withOneRetry(fn, {
        delayMs: 0,
        isRetryable: () => false,
        onRetry,
      }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('rethrows the second failure after one retry', async () => {
    const first = new Error('HTTP Error 429');
    const second = new Error('HTTP Error 429 again');
    const fn = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(second);

    await expect(withOneRetry(fn, { delayMs: 0 })).rejects.toBe(second);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('waits delayMs before the retry', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP Error 429'))
      .mockResolvedValueOnce('ok');

    const promise = withOneRetry(fn, { delayMs: 1500 });
    // First call has happened; second has not until the delay elapses.
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1499);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

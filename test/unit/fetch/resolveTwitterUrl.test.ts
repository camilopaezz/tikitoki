import { describe, expect, it } from 'vitest';
import { resolveTwitterUrl } from '../../../src/fetch/resolveTwitterUrl.js';

describe('resolveTwitterUrl', () => {
  it('strips query params and trailing slash from x.com status URLs', async () => {
    const result = await resolveTwitterUrl('https://x.com/user/status/1234567890?s=20&t=abc/');
    expect(result.url).toBe('https://x.com/user/status/1234567890');
  });

  it('normalizes twitter.com to x.com', async () => {
    const result = await resolveTwitterUrl('https://twitter.com/user/status/1234567890');
    expect(result.url).toBe('https://x.com/user/status/1234567890');
  });

  it('normalizes www.twitter.com to x.com', async () => {
    const result = await resolveTwitterUrl('https://www.twitter.com/user/status/99');
    expect(result.url).toBe('https://x.com/user/status/99');
  });

  it('strips hash fragments', async () => {
    const result = await resolveTwitterUrl('https://x.com/user/status/1#replies');
    expect(result.url).toBe('https://x.com/user/status/1');
  });

  it('normalizes www.x.com', async () => {
    const result = await resolveTwitterUrl('https://www.x.com/user/status/42');
    expect(result.url).toBe('https://x.com/user/status/42');
  });

  it('normalizes mobile.twitter.com', async () => {
    const result = await resolveTwitterUrl('https://mobile.twitter.com/user/status/7');
    expect(result.url).toBe('https://x.com/user/status/7');
  });

  it('normalizes mobile.x.com', async () => {
    const result = await resolveTwitterUrl('https://mobile.x.com/user/status/8');
    expect(result.url).toBe('https://x.com/user/status/8');
  });

  it('keeps /i/status/ form without a username', async () => {
    const result = await resolveTwitterUrl('https://x.com/i/status/2084391060336259405?s=20');
    expect(result.url).toBe('https://x.com/i/status/2084391060336259405');
  });
});

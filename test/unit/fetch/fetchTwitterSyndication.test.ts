import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchTwitterSyndication,
  TwitterSyndicationError,
} from '../../../src/fetch/fetchTwitterSyndication.js';

const fixture = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../fixtures/twitter/syndication-video-quotes-text.json',
  ),
  'utf8',
);

describe('fetchTwitterSyndication', () => {
  it('maps a successful syndication response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => fixture,
    });

    const chrome = await fetchTwitterSyndication({
      statusId: '2084391060336259405',
      sourceUrl: 'https://x.com/i/status/2084391060336259405',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(chrome.layoutKind).toBe('video_quotes');
    expect(chrome.outer.author.handle).toBe('brndxix');
    expect(fetchImpl).toHaveBeenCalled();
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toContain('cdn.syndication.twimg.com/tweet-result');
    expect(calledUrl).toContain('id=2084391060336259405');
  });

  it('throws on non-OK HTTP status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '',
    });

    await expect(
      fetchTwitterSyndication({
        statusId: '1',
        sourceUrl: 'https://x.com/i/status/1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TwitterSyndicationError);
  });

  it('throws on invalid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'not-json',
    });

    await expect(
      fetchTwitterSyndication({
        statusId: '1',
        sourceUrl: 'https://x.com/i/status/1',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/invalid JSON/i);
  });
});

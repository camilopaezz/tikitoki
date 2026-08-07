import { createLogger } from '../util/logger.js';
import { mapTwitterChrome, type SyndicationTweet } from './mapTwitterChrome.js';
import type { XPostChrome } from './twitterChromeTypes.js';

const logger = createLogger();

const DEFAULT_TIMEOUT_MS = 15_000;

export class TwitterSyndicationError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'TwitterSyndicationError';
  }
}

export interface FetchTwitterSyndicationOptions {
  statusId: string;
  sourceUrl: string;
  jobId?: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function syndicationUrl(statusId: string): string {
  const u = new URL('https://cdn.syndication.twimg.com/tweet-result');
  u.searchParams.set('id', statusId);
  u.searchParams.set('lang', 'en');
  // Embed clients pass a token; 0 works for public tweets in practice.
  u.searchParams.set('token', '0');
  return u.toString();
}

/**
 * Fetch chrome metadata from Twitter's public syndication/embed endpoint.
 */
export async function fetchTwitterSyndication(
  opts: FetchTwitterSyndicationOptions,
): Promise<XPostChrome> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = syndicationUrl(opts.statusId);

  log.debug(`Fetching Twitter syndication for status ${opts.statusId}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; tikitoki/1.2; +https://github.com/camilopaezz/tikitoki)',
        accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new TwitterSyndicationError(
        `Syndication request failed: ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    const text = await res.text();
    if (!text.trim()) {
      throw new TwitterSyndicationError('Syndication returned an empty body');
    }

    let raw: SyndicationTweet;
    try {
      raw = JSON.parse(text) as SyndicationTweet;
    } catch {
      throw new TwitterSyndicationError('Syndication returned invalid JSON');
    }

    return mapTwitterChrome(raw, {
      sourceUrl: opts.sourceUrl,
      fallbackStatusId: opts.statusId,
    });
  } catch (err) {
    if (err instanceof TwitterSyndicationError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new TwitterSyndicationError(`Syndication request timed out after ${timeoutMs}ms`);
    }
    throw new TwitterSyndicationError(`Syndication request error: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

import { createLogger } from '../util/logger.js';

const logger = createLogger();

export interface ResolvedTwitterUrl {
  url: string;
}

function parseOrNull(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeHost(hostname: string): string {
  const host = hostname.toLowerCase();
  if (host === 'twitter.com' || host.endsWith('.twitter.com')) {
    return 'x.com';
  }
  if (host === 'www.x.com' || host === 'mobile.x.com') {
    return 'x.com';
  }
  return host;
}

/** Normalize twitter.com / x.com status links (strip query/hash). */
export async function resolveTwitterUrl(url: string, jobId?: string): Promise<ResolvedTwitterUrl> {
  const log = jobId ? createLogger({ jobId }) : logger;

  const parsed = parseOrNull(url);
  let canonical = url;
  if (parsed) {
    parsed.search = '';
    parsed.hash = '';
    parsed.hostname = normalizeHost(parsed.hostname);
    canonical = parsed.toString().replace(/\/$/, '');
  }

  log.debug(`Resolved Twitter ${url} -> ${canonical}`);
  return { url: canonical };
}

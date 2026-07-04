import { createLogger } from '../util/logger.js';

const logger = createLogger();

export interface ResolvedInstagramUrl {
  url: string;
  isCarousel: boolean;
  isReel: boolean;
}

function parseOrNull(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export async function resolveInstagramUrl(
  url: string,
  jobId?: string,
): Promise<ResolvedInstagramUrl> {
  const log = jobId ? createLogger({ jobId }) : logger;

  const parsed = parseOrNull(url);
  let canonical = url;
  let pathname = url;
  if (parsed) {
    parsed.search = '';
    canonical = parsed.toString();
    pathname = parsed.pathname;
  }

  const isCarousel = pathname.includes('/p/');
  const isReel = pathname.includes('/reel/') || pathname.includes('/reels/');

  log.debug(`Resolved Instagram ${url} -> ${canonical} (carousel=${isCarousel}, reel=${isReel})`);

  return { url: canonical, isCarousel, isReel };
}

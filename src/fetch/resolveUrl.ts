import { createLogger } from '../util/logger.js';

const logger = createLogger();

export interface ResolvedUrl {
  url: string;
  isSlideshow: boolean;
}

function isPhotoUrl(url: string): boolean {
  try {
    return new URL(url).pathname.includes('/photo/');
  } catch {
    return url.includes('/photo/');
  }
}

function isShortUrl(url: string): boolean {
  return /^https?:\/\/(?:vt|vm)\.tiktok\.com\//i.test(url);
}

export async function resolveTikTokUrl(url: string, jobId?: string): Promise<ResolvedUrl> {
  const log = jobId ? createLogger({ jobId }) : logger;

  if (isPhotoUrl(url)) {
    return { url, isSlideshow: true };
  }

  if (isShortUrl(url)) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const finalUrl = res.url;
      log.debug(`Resolved ${url} -> ${finalUrl}`);
      return { url: finalUrl, isSlideshow: isPhotoUrl(finalUrl) };
    } catch (err) {
      log.debug(`Failed to resolve short URL ${url}: ${(err as Error).message}`);
    }
  }

  return { url, isSlideshow: false };
}

export function rewriteToVideoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace('/photo/', '/video/');
    return parsed.toString();
  } catch {
    return url.replace('/photo/', '/video/');
  }
}

import { runYtDlp } from '../process/ytDlp.js';
import { createLogger } from '../util/logger.js';
import { AuthFailureError, detectAuthFailure } from './authFailure.js';
import { cookieArgs } from './cookies.js';
import { extractCarouselFromDir } from './extractInstagramCarousel.js';

const logger = createLogger();

export class MixedCarouselError extends Error {
  constructor() {
    super('Mixed carousels (images + videos) are not supported yet.');
    this.name = 'MixedCarouselError';
  }
}

export class SingleImageError extends Error {
  constructor() {
    super('Single-image posts are not supported. Send a carousel or a reel.');
    this.name = 'SingleImageError';
  }
}

export interface CarouselEntry {
  id: string;
  thumbnails: { url: string; width?: number; height?: number }[];
}

export interface CarouselMetadata {
  entries: CarouselEntry[];
}

export async function dumpInstagramCarousel(opts: {
  url: string;
  cookiesPath?: string;
  pagesDir: string;
  jobId?: string;
}): Promise<CarouselMetadata> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const args = [
    '-J',
    '--write-pages',
    '--no-download',
    '--ignore-no-formats-error',
    ...cookieArgs(opts.cookiesPath),
    opts.url,
  ];

  log.debug(`Dumping Instagram carousel metadata for ${opts.url}`);

  try {
    await runYtDlp(args, { jobId: opts.jobId, cwd: opts.pagesDir });
  } catch (err) {
    const stderr = (err as Error).message;
    if (detectAuthFailure(stderr)) {
      log.error('Auth failure detected in yt-dlp stderr');
      throw new AuthFailureError(undefined, 'instagram');
    }
    throw err;
  }

  const items = extractCarouselFromDir(opts.pagesDir);

  if (items.some((item) => item.hasVideo)) {
    throw new MixedCarouselError();
  }

  if (items.length === 1) {
    throw new SingleImageError();
  }

  if (items.length === 0) {
    throw new Error('Instagram carousel returned no entries from page data');
  }

  log.debug(`Extracted ${items.length} image carousel entries`);

  const entries: CarouselEntry[] = items.map((item) => ({
    id: item.id,
    thumbnails: item.candidates,
  }));

  return { entries };
}

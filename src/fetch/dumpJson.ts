import { runYtDlp } from '../process/ytDlp.js';
import { createLogger } from '../util/logger.js';
import { AuthFailureError, detectAuthFailure } from './authFailure.js';
import { cookieArgs } from './cookies.js';
import { extractImagePostFromDir, extractMusicDurationFromDir } from './extractImagePost.js';
import { rewriteToVideoUrl } from './resolveUrl.js';

const logger = createLogger();

export interface DumpJsonOptions {
  url: string;
  cookiesPath?: string;
  jobId?: string;
  isSlideshow?: boolean;
  pagesDir?: string;
}

export async function dumpJson(opts: DumpJsonOptions): Promise<unknown> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;

  if (opts.isSlideshow && opts.pagesDir) {
    return dumpSlideshowJson(opts, log);
  }

  const args = ['-j', '--no-download', ...cookieArgs(opts.cookiesPath), opts.url];
  log.debug(`Dumping JSON for ${opts.url}`);
  try {
    const { stdout } = await runYtDlp(args, { jobId: opts.jobId });
    return JSON.parse(stdout);
  } catch (err) {
    const stderr = (err as Error).message;
    if (detectAuthFailure(stderr)) {
      log.error('Auth failure detected in yt-dlp stderr');
      throw new AuthFailureError();
    }
    throw err;
  }
}

async function dumpSlideshowJson(
  opts: DumpJsonOptions,
  log: ReturnType<typeof createLogger>,
): Promise<unknown> {
  if (!opts.pagesDir) {
    throw new Error('pagesDir is required for slideshow metadata extraction');
  }
  const pagesDir = opts.pagesDir;
  const videoUrl = rewriteToVideoUrl(opts.url);
  log.debug(`Fetching slideshow metadata via rewritten URL: ${videoUrl}`);
  const args = ['-j', '--no-download', '--write-pages', ...cookieArgs(opts.cookiesPath), videoUrl];

  let stdout: string;
  try {
    const result = await runYtDlp(args, { jobId: opts.jobId, cwd: pagesDir });
    stdout = result.stdout;
  } catch (err) {
    const stderr = (err as Error).message;
    if (detectAuthFailure(stderr)) {
      log.error('Auth failure detected in yt-dlp stderr');
      throw new AuthFailureError();
    }
    throw err;
  }

  const info = JSON.parse(stdout) as Record<string, unknown>;

  const slides = extractImagePostFromDir(pagesDir);
  if (slides.length === 0) {
    throw new Error(
      'No slide images found in TikTok page data; yt-dlp may not have fetched the webpage',
    );
  }

  log.debug(`Extracted ${slides.length} slide images from page data`);

  info.album = true;
  info.thumbnails = slides.map((slide, i) => ({
    id: `slide_${i}`,
    url: slide.url,
    width: slide.width,
    height: slide.height,
  }));

  const musicDuration = extractMusicDurationFromDir(pagesDir);
  if (musicDuration && (!info.duration || info.duration === 0)) {
    info.duration = musicDuration;
  }

  return info;
}

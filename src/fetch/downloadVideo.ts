import { statSync } from 'node:fs';
import { join } from 'node:path';
import { runYtDlp } from '../process/ytDlp.js';
import { createLogger } from '../util/logger.js';
import {
  isPermanentHttpClientError,
  isTransientDownloadError,
  withOneRetry,
} from '../util/retry.js';
import { AuthFailureError, type AuthFailurePlatform, detectAuthFailure } from './authFailure.js';
import { cookieArgs } from './cookies.js';
import { detectNoVideo, NoVideoError } from './noVideo.js';
import { refererArgs } from './referer.js';

const logger = createLogger();

export class OversizedVideoError extends Error {
  constructor(
    public readonly sizeBytes: number,
    public readonly maxBytes: number,
  ) {
    super(
      `Downloaded video is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB, exceeding the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit.`,
    );
    this.name = 'OversizedVideoError';
  }
}

export interface DownloadVideoOptions {
  url: string;
  outDir: string;
  cookiesPath?: string;
  maxSizeMb?: number;
  jobId?: string;
  platform?: AuthFailurePlatform;
}

function isRetryableDownloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Permanent classification outcomes — do not burn a retry.
  if (detectAuthFailure(msg) || detectNoVideo(msg)) return false;
  if (isPermanentHttpClientError(err)) return false;
  return isTransientDownloadError(err);
}

export async function downloadVideo(opts: DownloadVideoOptions): Promise<string> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const outPath = join(opts.outDir, 'out.mp4');
  const args = ['-o', outPath, ...cookieArgs(opts.cookiesPath), ...refererArgs(opts.url), opts.url];

  log.debug(`Downloading video to ${outPath}`);
  try {
    await withOneRetry(() => runYtDlp(args, { jobId: opts.jobId }), {
      isRetryable: isRetryableDownloadError,
      onRetry: (err) => {
        log.warn(`Transient download failure; retrying once: ${(err as Error).message}`);
      },
    });
    if (opts.maxSizeMb !== undefined) {
      const maxBytes = opts.maxSizeMb * 1024 * 1024;
      const size = statSync(outPath).size;
      if (size > maxBytes) {
        throw new OversizedVideoError(size, maxBytes);
      }
    }
    return outPath;
  } catch (err) {
    const stderr = (err as Error).message;
    if (detectAuthFailure(stderr)) {
      log.error('Auth failure detected while downloading video');
      throw new AuthFailureError(undefined, opts.platform);
    }
    if (detectNoVideo(stderr)) {
      log.info('No downloadable video found for URL');
      throw new NoVideoError();
    }
    throw err;
  }
}

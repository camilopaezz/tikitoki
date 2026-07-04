import { statSync } from 'node:fs';
import { join } from 'node:path';
import { runYtDlp } from '../process/ytDlp.js';
import { createLogger } from '../util/logger.js';
import { AuthFailureError, detectAuthFailure } from './authFailure.js';
import { cookieArgs } from './cookies.js';

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
}

export async function downloadVideo(opts: DownloadVideoOptions): Promise<string> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const outPath = join(opts.outDir, 'out.mp4');
  const args = ['-o', outPath, ...cookieArgs(opts.cookiesPath), opts.url];

  log.debug(`Downloading video to ${outPath}`);
  try {
    await runYtDlp(args, { jobId: opts.jobId });
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
      throw new AuthFailureError();
    }
    throw err;
  }
}

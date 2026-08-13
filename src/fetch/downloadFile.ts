import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createLogger } from '../util/logger.js';
import { isTransientDownloadError, withOneRetry } from '../util/retry.js';

const logger = createLogger();

export interface DownloadFileOptions {
  headers?: Record<string, string>;
  jobId?: string;
}

export function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    return match ? `.${match[1].toLowerCase()}` : '';
  } catch {
    return '';
  }
}

async function downloadFileOnce(
  url: string,
  dest: string,
  opts: DownloadFileOptions,
): Promise<void> {
  const response = await fetch(url, { headers: opts.headers });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const body = response.body;
  if (!body) {
    throw new Error(`Empty response body for ${url}`);
  }
  await pipeline(
    Readable.fromWeb(body as import('stream/web').ReadableStream),
    createWriteStream(dest),
  );
}

export async function downloadFile(
  url: string,
  dest: string,
  opts: DownloadFileOptions = {},
): Promise<void> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  await withOneRetry(() => downloadFileOnce(url, dest, opts), {
    isRetryable: isTransientDownloadError,
    onRetry: (err) => {
      log.warn(`Transient file download failure; retrying once: ${(err as Error).message}`);
    },
  });
}

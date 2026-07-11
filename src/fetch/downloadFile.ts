import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface DownloadFileOptions {
  headers?: Record<string, string>;
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

export async function downloadFile(
  url: string,
  dest: string,
  opts: DownloadFileOptions = {},
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

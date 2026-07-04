import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../util/logger.js';
import { downloadFile } from './downloadFile.js';
import type { SlideshowAssets } from './downloadSlideshow.js';
import type { CarouselEntry } from './dumpInstagramCarousel.js';
import type { CarouselMusic } from './extractInstagramMusic.js';

const logger = createLogger();

const INSTAGRAM_REFERER = 'https://www.instagram.com/';

export interface DownloadInstagramCarouselOptions {
  entries: CarouselEntry[];
  music: CarouselMusic;
  outDir: string;
  jobId?: string;
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    return match ? `.${match[1].toLowerCase()}` : '';
  } catch {
    return '';
  }
}

function pickLargestThumbnail(thumbnails: CarouselEntry['thumbnails']): string {
  if (thumbnails.length === 0) {
    throw new Error('Instagram carousel entry has no thumbnails');
  }
  const sorted = [...thumbnails].sort((a, b) => {
    const aArea = (a.width ?? 0) * (a.height ?? 0);
    const bArea = (b.width ?? 0) * (b.height ?? 0);
    return bArea - aArea;
  });
  return sorted[0].url;
}

async function downloadWithReferer(url: string, dest: string, label: string): Promise<void> {
  try {
    await downloadFile(url, dest, { headers: { Referer: INSTAGRAM_REFERER } });
  } catch (err) {
    const message = (err as Error).message;
    if (/\b403\b/.test(message)) {
      throw new Error(
        `Instagram CDN returned 403 for ${label} (${url}). Referer header was set; ` +
          'the URL may be expired or cookies may be required.',
      );
    }
    throw err;
  }
}

export async function downloadInstagramCarousel(
  opts: DownloadInstagramCarouselOptions,
): Promise<SlideshowAssets> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const imagesDir = join(opts.outDir, 'images');
  await mkdir(imagesDir, { recursive: true });

  const images: string[] = [];
  for (let i = 0; i < opts.entries.length; i++) {
    const entry = opts.entries[i];
    const url = pickLargestThumbnail(entry.thumbnails);
    const ext = extensionFromUrl(url) || '.jpg';
    const fileName = `slide_${String(i).padStart(3, '0')}${ext}`;
    const dest = join(imagesDir, fileName);
    log.debug(`Downloading Instagram slide ${i + 1}/${opts.entries.length}`);
    await downloadWithReferer(url, dest, `slide ${i + 1}`);
    images.push(dest);
  }

  let audio: string | undefined;
  if (opts.music.url) {
    const ext = extensionFromUrl(opts.music.url) || '.m4a';
    audio = join(opts.outDir, `audio${ext}`);
    log.debug('Downloading Instagram carousel audio');
    await downloadWithReferer(opts.music.url, audio, 'audio');
  }

  return { images, audio, audioStartMs: opts.music.startTimeMs };
}

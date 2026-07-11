import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../util/logger.js';
import type { FormatInfo, PostInfo, ThumbnailInfo } from './classify.js';
import { downloadFile, extensionFromUrl } from './downloadFile.js';

const logger = createLogger();

export interface DownloadSlideshowOptions {
  info: PostInfo;
  outDir: string;
  jobId?: string;
}

export interface SlideshowAssets {
  images: string[];
  audio?: string;
  duration?: number;
  audioStartMs?: number;
}

function pickAudioUrl(formats: FormatInfo[] = []): string | undefined {
  const audioFormats = formats.filter(
    (fmt) => fmt.acodec && fmt.acodec !== 'none' && (!fmt.vcodec || fmt.vcodec === 'none'),
  );
  if (audioFormats.length === 0) return undefined;

  // Prefer best audio by bitrate heuristic: larger filesize not available here,
  // so we just take the last audio-only format (yt-dlp usually orders worst->best).
  return audioFormats[audioFormats.length - 1].url;
}

function slideUrls(thumbnails: ThumbnailInfo[] = []): string[] {
  // Filter out the story/avatar thumbnails; keep ones that look like slides.
  // TikTok slide thumbnails usually have numeric ids or no id.
  return thumbnails
    .filter((t) => {
      if (!t.url) return false;
      // Skip cover/avatar thumbnails if they are identified.
      if (t.id && ['avatar', 'cover', 'origin_cover'].includes(t.id)) return false;
      return true;
    })
    .map((t) => t.url as string);
}

export async function downloadSlideshow(opts: DownloadSlideshowOptions): Promise<SlideshowAssets> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const imagesDir = join(opts.outDir, 'images');
  await mkdir(imagesDir, { recursive: true });

  const urls = slideUrls(opts.info.thumbnails);
  if (urls.length === 0) {
    throw new Error('No slide images found in TikTok metadata');
  }

  const images: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const ext = extensionFromUrl(url) || '.jpg';
    const fileName = `slide_${String(i).padStart(3, '0')}${ext}`;
    const dest = join(imagesDir, fileName);
    log.debug(`Downloading slide ${i + 1}/${urls.length}`);
    await downloadFile(url, dest);
    images.push(dest);
  }

  const audioUrl = pickAudioUrl(opts.info.formats);
  let audio: string | undefined;
  if (audioUrl) {
    const ext = extensionFromUrl(audioUrl) || '.m4a';
    audio = join(opts.outDir, `audio${ext}`);
    log.debug('Downloading background audio');
    await downloadFile(audioUrl, audio);
  }

  return { images, audio, duration: opts.info.duration };
}

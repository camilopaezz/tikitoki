import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { probeVideo } from '../render/probe.js';
import { createLogger } from '../util/logger.js';
import { downloadFile, extensionFromUrl } from './downloadFile.js';
import { downloadVideo } from './downloadVideo.js';
import type { XPostChrome } from './twitterChromeTypes.js';

const logger = createLogger();

export interface XAuthorLocal {
  name: string;
  handle: string;
  avatarPath?: string;
  verified: boolean;
}

export interface XVideoLocal {
  path: string;
  width: number;
  height: number;
  durationSec: number;
}

export interface XImageLocal {
  path: string;
  width?: number;
  height?: number;
}

export interface XQuoteLocal {
  author: XAuthorLocal;
  text: XPostChrome['outer']['text'];
  images: XImageLocal[];
  statusId?: string;
}

/** Chrome model with local media paths after Phase 2 downloads. */
export interface XPostAssets {
  layoutKind: XPostChrome['layoutKind'];
  statusId: string;
  sourceUrl: string;
  outer: {
    author: XAuthorLocal;
    text: XPostChrome['outer']['text'];
  };
  primaryVideo: XVideoLocal;
  quote?: XQuoteLocal;
}

export interface DownloadXAssetsOptions {
  chrome: XPostChrome;
  outDir: string;
  cookiesPath?: string;
  /** Soft cap on raw yt-dlp file; re-encode size is handled later. Optional. */
  maxSizeMb?: number;
  jobId?: string;
  /** Test seams */
  downloadVideoFn?: typeof downloadVideo;
  downloadFileFn?: typeof downloadFile;
  probeVideoFn?: typeof probeVideo;
}

async function tryDownloadAvatar(
  url: string | undefined,
  dest: string,
  downloadFileFn: typeof downloadFile,
  log: ReturnType<typeof createLogger>,
): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    await downloadFileFn(url, dest);
    return dest;
  } catch (err) {
    log.warn(`Avatar download failed (${url}): ${(err as Error).message}`);
    return undefined;
  }
}

function videoPageUrl(chrome: XPostChrome): string {
  if (chrome.layoutKind === 'quote_of_video' && chrome.quote?.statusId) {
    return `https://x.com/i/status/${chrome.quote.statusId}`;
  }
  return chrome.sourceUrl;
}

/**
 * Materialize local files for an xrender job: primary video (yt-dlp), avatars,
 * and quote images. Avatar failures degrade to missing path (placeholder later).
 */
export async function downloadXAssets(opts: DownloadXAssetsOptions): Promise<XPostAssets> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const downloadVideoFn = opts.downloadVideoFn ?? downloadVideo;
  const downloadFileFn = opts.downloadFileFn ?? downloadFile;
  const probeVideoFn = opts.probeVideoFn ?? probeVideo;

  const chromeDir = join(opts.outDir, 'xchrome');
  await mkdir(chromeDir, { recursive: true });

  const videoUrl = videoPageUrl(opts.chrome);
  log.info(`Downloading xrender primary video from ${videoUrl}`);
  const videoPath = await downloadVideoFn({
    url: videoUrl,
    outDir: opts.outDir,
    cookiesPath: opts.cookiesPath,
    maxSizeMb: opts.maxSizeMb,
    jobId: opts.jobId,
    platform: 'twitter',
  });

  let width = opts.chrome.primaryVideo.width;
  let height = opts.chrome.primaryVideo.height;
  let durationSec = opts.chrome.primaryVideo.durationSec;
  try {
    const probed = await probeVideoFn(videoPath, opts.jobId);
    width = probed.width;
    height = probed.height;
    durationSec = probed.durationSec;
  } catch (err) {
    log.warn(`Video probe failed, using syndication dims: ${(err as Error).message}`);
  }

  if (!width || !height || !durationSec || durationSec <= 0) {
    throw new Error('Could not determine primary video dimensions/duration for xrender');
  }

  const outerAvatarPath = await tryDownloadAvatar(
    opts.chrome.outer.author.avatarUrl,
    join(
      chromeDir,
      `avatar_outer${extensionFromUrl(opts.chrome.outer.author.avatarUrl ?? '') || '.jpg'}`,
    ),
    downloadFileFn,
    log,
  );

  let quote: XQuoteLocal | undefined;
  if (opts.chrome.quote) {
    const q = opts.chrome.quote;
    const quoteAvatarPath = await tryDownloadAvatar(
      q.author.avatarUrl,
      join(chromeDir, `avatar_quote${extensionFromUrl(q.author.avatarUrl ?? '') || '.jpg'}`),
      downloadFileFn,
      log,
    );

    const images: XImageLocal[] = [];
    for (let i = 0; i < q.images.length; i++) {
      const img = q.images[i];
      const ext = extensionFromUrl(img.url) || '.jpg';
      const dest = join(chromeDir, `quote_img_${String(i).padStart(2, '0')}${ext}`);
      try {
        await downloadFileFn(img.url, dest);
        images.push({ path: dest, width: img.width, height: img.height });
      } catch (err) {
        log.warn(`Quote image ${i} download failed: ${(err as Error).message}`);
      }
    }

    quote = {
      author: {
        name: q.author.name,
        handle: q.author.handle,
        avatarPath: quoteAvatarPath,
        verified: q.author.verified,
      },
      text: q.text,
      images,
      statusId: q.statusId,
    };
  }

  return {
    layoutKind: opts.chrome.layoutKind,
    statusId: opts.chrome.statusId,
    sourceUrl: opts.chrome.sourceUrl,
    outer: {
      author: {
        name: opts.chrome.outer.author.name,
        handle: opts.chrome.outer.author.handle,
        avatarPath: outerAvatarPath,
        verified: opts.chrome.outer.author.verified,
      },
      text: opts.chrome.outer.text,
    },
    primaryVideo: {
      path: videoPath,
      width,
      height,
      durationSec,
    },
    quote,
  };
}

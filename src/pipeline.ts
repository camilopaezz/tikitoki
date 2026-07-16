import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from './config/index.js';
import { classify, type PostInfo } from './fetch/classify.js';
import { downloadInstagramCarousel } from './fetch/downloadInstagramCarousel.js';
import { downloadSlideshow, type SlideshowAssets } from './fetch/downloadSlideshow.js';
import { downloadVideo } from './fetch/downloadVideo.js';
import { dumpInstagramCarousel } from './fetch/dumpInstagramCarousel.js';
import { dumpJson } from './fetch/dumpJson.js';
import { extractMusicFromDir } from './fetch/extractInstagramMusic.js';
import { resolveInstagramUrl } from './fetch/resolveInstagramUrl.js';
import { resolveTikTokUrl } from './fetch/resolveUrl.js';
import type { Job, JobResult, Stage } from './job/types.js';
import { renderSlideshow } from './render/renderSlideshow.js';
import { createLogger } from './util/logger.js';
import { perJobDir } from './util/tmp.js';

export interface PipelineOptions {
  config: Config;
}

type Fetched =
  | { kind: 'video'; outputPath: string }
  | { kind: 'slideshow'; assets: SlideshowAssets };

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/i.test(url);
}

async function fetchInstagram(job: Job, jobDir: string, config: Config): Promise<Fetched> {
  const resolved = await resolveInstagramUrl(job.url, job.jobId);

  if (resolved.isReel) {
    const outputPath = await downloadVideo({
      url: resolved.url,
      outDir: jobDir,
      cookiesPath: config.instagramCookiesPath,
      maxSizeMb: config.targetSizeMb,
      jobId: job.jobId,
      platform: 'instagram',
    });
    return { kind: 'video', outputPath };
  }

  if (resolved.isCarousel) {
    const pagesDir = join(jobDir, 'pages');
    await mkdir(pagesDir, { recursive: true });
    const { entries } = await dumpInstagramCarousel({
      url: resolved.url,
      cookiesPath: config.instagramCookiesPath,
      pagesDir,
      jobId: job.jobId,
    });
    const music = extractMusicFromDir(pagesDir);
    const assets = await downloadInstagramCarousel({
      entries,
      music,
      outDir: jobDir,
      jobId: job.jobId,
    });
    return { kind: 'slideshow', assets };
  }

  throw new Error(`Unsupported Instagram URL (not a reel or carousel): ${resolved.url}`);
}

async function fetchTikTok(
  job: Job,
  jobDir: string,
  config: Config,
  log: ReturnType<typeof createLogger>,
): Promise<Fetched> {
  const resolved = await resolveTikTokUrl(job.url, job.jobId);
  if (resolved.isSlideshow) {
    log.info('Detected TikTok slideshow (photo post)');
  }
  const pagesDir = join(jobDir, 'pages');
  if (resolved.isSlideshow) {
    await mkdir(pagesDir, { recursive: true });
  }
  const info = (await dumpJson({
    url: resolved.url,
    cookiesPath: config.cookiesPath,
    jobId: job.jobId,
    isSlideshow: resolved.isSlideshow,
    pagesDir: resolved.isSlideshow ? pagesDir : undefined,
  })) as PostInfo;

  const kind = classify(info);
  log.info(`Classified post as ${kind}`);

  if (kind === 'video') {
    const outputPath = await downloadVideo({
      url: resolved.url,
      outDir: jobDir,
      cookiesPath: config.cookiesPath,
      maxSizeMb: config.targetSizeMb,
      jobId: job.jobId,
    });
    return { kind: 'video', outputPath };
  }

  const assets = await downloadSlideshow({
    info,
    outDir: jobDir,
    jobId: job.jobId,
  });
  return { kind: 'slideshow', assets };
}

export function createPipeline(options: PipelineOptions) {
  const { config } = options;

  return async function runPipeline(
    job: Job,
    onStage: (stage: Stage) => Promise<void>,
  ): Promise<JobResult> {
    const log = createLogger({ jobId: job.jobId, userId: job.userId });
    const jobDir = perJobDir(job.jobId);

    await onStage('Fetching');
    log.info(`Fetching metadata for ${job.url}`);

    const fetched = isInstagramUrl(job.url)
      ? await fetchInstagram(job, jobDir, config)
      : await fetchTikTok(job, jobDir, config, log);

    if (fetched.kind === 'video') {
      // Video posts bypass the Rendering stage.
      await onStage('Uploading');
      return { outputPath: fetched.outputPath };
    }

    await onStage('Rendering');
    const { outputPath } = await renderSlideshow({
      jobId: job.jobId,
      images: fetched.assets.images,
      audioPath: fetched.assets.audio,
      audioDuration: fetched.assets.duration,
      audioStartMs: fetched.assets.audioStartMs,
      targetSizeMb: config.targetSizeMb,
      crossfadeSeconds: config.crossfadeSeconds,
      silentSlideSeconds: config.silentSlideSeconds,
    });
    await onStage('Uploading');
    return { outputPath };
  };
}

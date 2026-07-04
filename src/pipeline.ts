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

    if (/instagram\.com/i.test(job.url)) {
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
        await onStage('Uploading');
        return { outputPath };
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

        const assets: SlideshowAssets = await downloadInstagramCarousel({
          entries,
          music,
          outDir: jobDir,
          jobId: job.jobId,
        });
        await onStage('Rendering');
        const { outputPath } = await renderSlideshow({
          jobId: job.jobId,
          images: assets.images,
          audioPath: assets.audio,
          audioStartMs: assets.audioStartMs,
          targetSizeMb: config.targetSizeMb,
          crossfadeSeconds: config.crossfadeSeconds,
          silentSlideSeconds: config.silentSlideSeconds,
        });
        await onStage('Uploading');
        return { outputPath };
      }

      throw new Error(`Unsupported Instagram URL (not a reel or carousel): ${resolved.url}`);
    }

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
      // Video posts bypass the Rendering stage.
      await onStage('Uploading');
      return { outputPath };
    }

    const assets: SlideshowAssets = await downloadSlideshow({
      info,
      outDir: jobDir,
      jobId: job.jobId,
    });

    await onStage('Rendering');
    const { outputPath } = await renderSlideshow({
      jobId: job.jobId,
      images: assets.images,
      audioPath: assets.audio,
      audioDuration: assets.duration,
      targetSizeMb: config.targetSizeMb,
      crossfadeSeconds: config.crossfadeSeconds,
      silentSlideSeconds: config.silentSlideSeconds,
    });

    await onStage('Uploading');
    return { outputPath };
  };
}

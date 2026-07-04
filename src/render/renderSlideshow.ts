import { createLogger } from '../util/logger.js';
import { perJobDir } from '../util/tmp.js';
import { computeBitrateBudget } from './bitrate.js';
import { pickCanvas, type Slide } from './canvas.js';
import { writeConcatFile } from './concatDemuxer.js';
import { twoPassEncode } from './encode.js';
import { buildFiltergraph } from './filtergraph.js';
import { probeImageDimensions } from './probe.js';
import { downscaleTo720 } from './retry720.js';
import { computeTiming } from './timing.js';

export interface RenderSlideshowOptions {
  jobId: string;
  images: string[];
  audioPath?: string;
  audioDuration?: number;
  audioStartMs?: number;
  targetSizeMb?: number;
  crossfadeSeconds?: number;
  silentSlideSeconds?: number;
}

export interface RenderSlideshowResult {
  outputPath: string;
}

export async function renderSlideshow(
  opts: RenderSlideshowOptions,
): Promise<RenderSlideshowResult> {
  const log = createLogger({ jobId: opts.jobId });
  const jobDir = perJobDir(opts.jobId);

  const slides: Slide[] = [];
  for (const path of opts.images) {
    const dims = await probeImageDimensions(path, opts.jobId);
    slides.push({ path, ...dims });
  }

  const canvas = pickCanvas(slides);
  const hasAudio = opts.audioPath !== undefined;
  const timing = computeTiming(
    slides.length,
    opts.audioDuration,
    opts.silentSlideSeconds ?? 3,
    hasAudio,
  );

  writeConcatFile(opts.images, `${jobDir}/concat.txt`);

  const budget = computeBitrateBudget(
    opts.targetSizeMb ?? 45,
    timing.totalDuration,
    canvas.width,
    canvas.height,
  );

  let finalCanvas = canvas;
  if (budget.needsDownscale) {
    log.info(`Budget below quality floor at ${canvas.width}x${canvas.height}; retrying at 720p`);
    finalCanvas = downscaleTo720(canvas);
  }

  const { filterComplex } = buildFiltergraph({
    slides,
    canvas: finalCanvas,
    timing,
    crossfadeSeconds: opts.crossfadeSeconds ?? 0.4,
  });

  log.info(`Rendering ${slides.length} slides at ${finalCanvas.width}x${finalCanvas.height}`);
  const { outputPath } = await twoPassEncode({
    jobDir,
    inputs: opts.images,
    filterComplex,
    canvas: finalCanvas,
    budget,
    audioPath: opts.audioPath,
    audioStartMs: opts.audioStartMs,
    addSilentAudio: timing.addSilentAudio,
    jobId: opts.jobId,
  });

  return { outputPath };
}

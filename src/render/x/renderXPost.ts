import { join } from 'node:path';
import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { runFfmpeg } from '../../process/ffmpeg.js';
import { createLogger } from '../../util/logger.js';
import { computeBitrateBudget } from '../bitrate.js';
import { buildChromeHtml } from './chromeHtml.js';
import { buildXOverlayFiltergraph } from './filtergraph.js';
import { layoutXPost } from './layout.js';
import { screenshotChrome } from './screenshotChrome.js';

export interface RenderXPostOptions {
  jobId: string;
  assets: XPostAssets;
  jobDir: string;
  targetSizeMb?: number;
  /** Injectables for tests */
  screenshotFn?: typeof screenshotChrome;
  runFfmpegFn?: typeof runFfmpeg;
}

export interface RenderXPostResult {
  outputPath: string;
}

/**
 * Layout → chrome PNG → ffmpeg overlay of primary video under chrome + source audio.
 */
export async function renderXPost(opts: RenderXPostOptions): Promise<RenderXPostResult> {
  const log = createLogger({ jobId: opts.jobId });
  const screenshotFn = opts.screenshotFn ?? screenshotChrome;
  const runFfmpegFn = opts.runFfmpegFn ?? runFfmpeg;

  const layout = layoutXPost(opts.assets);
  log.info(
    `xrender layout ${layout.canvas.width}x${layout.canvas.height} media=${layout.mediaSlot.w}x${layout.mediaSlot.h} fit=${layout.mediaSlot.fit}`,
  );

  const html = buildChromeHtml(opts.assets, layout);
  const chromePath = await screenshotFn({
    html,
    jobDir: opts.jobDir,
    width: layout.canvas.width,
    height: layout.canvas.height,
    jobId: opts.jobId,
  });

  const duration = opts.assets.primaryVideo.durationSec;
  let canvas = layout.canvas;
  let budget = computeBitrateBudget(opts.targetSizeMb ?? 45, duration, canvas.width, canvas.height);

  // Downscale whole composition if bitrate floor missed (keep aspect).
  let filterLayout = layout;
  if (budget.needsDownscale) {
    const scale = 720 / canvas.width;
    const w = Math.round(720 / 2) * 2;
    const h = Math.round((canvas.height * scale) / 2) * 2;
    log.info(`xrender budget low; downscaling canvas to ${w}x${h}`);
    filterLayout = scaleLayout(layout, w / canvas.width);
    canvas = filterLayout.canvas;
    budget = computeBitrateBudget(opts.targetSizeMb ?? 45, duration, w, h);
  }

  const filterComplex = buildXOverlayFiltergraph({
    layout: filterLayout,
    videoWidth: opts.assets.primaryVideo.width,
    videoHeight: opts.assets.primaryVideo.height,
    durationSec: duration,
  });

  const outputPath = join(opts.jobDir, 'xrender.mp4');
  const passlog = join(opts.jobDir, 'xpasslog');

  // Loop chrome still for the full video duration; -shortest ties to the video stream.
  const commonIn = [
    '-i',
    opts.assets.primaryVideo.path,
    '-loop',
    '1',
    '-t',
    String(duration),
    '-i',
    chromePath,
  ];

  const videoCodec = [
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-b:v',
    String(budget.videoBitrate),
    '-maxrate',
    String(Math.floor(budget.videoBitrate * 1.5)),
    '-bufsize',
    String(budget.videoBitrate * 2),
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-movflags',
    '+faststart',
  ];

  log.debug('xrender encode pass 1');
  await runFfmpegFn(
    [
      ...commonIn,
      '-filter_complex',
      filterComplex,
      '-map',
      '[out]',
      '-an',
      ...videoCodec,
      '-pass',
      '1',
      '-passlogfile',
      passlog,
      '-f',
      'null',
      '/dev/null',
    ],
    { jobId: opts.jobId },
  );

  log.debug(`xrender encode pass 2 -> ${outputPath}`);
  await runFfmpegFn(
    [
      ...commonIn,
      '-filter_complex',
      filterComplex,
      '-map',
      '[out]',
      '-map',
      '0:a?',
      ...videoCodec,
      '-c:a',
      'aac',
      '-b:a',
      String(budget.audioBitrate),
      '-shortest',
      '-pass',
      '2',
      '-passlogfile',
      passlog,
      '-y',
      outputPath,
    ],
    { jobId: opts.jobId },
  );

  return { outputPath };
}

function scaleLayout(
  layout: ReturnType<typeof layoutXPost>,
  factor: number,
): ReturnType<typeof layoutXPost> {
  const even = (n: number) => {
    const r = Math.round(n);
    return r % 2 === 0 ? r : r + 1;
  };
  const s = (n: number) => even(n * factor);
  return {
    ...layout,
    canvas: { width: s(layout.canvas.width), height: s(layout.canvas.height) },
    contentWidth: s(layout.contentWidth),
    padX: s(layout.padX),
    mediaSlot: {
      ...layout.mediaSlot,
      x: s(layout.mediaSlot.x),
      y: s(layout.mediaSlot.y),
      w: s(layout.mediaSlot.w),
      h: s(layout.mediaSlot.h),
      cornerRadius: s(layout.mediaSlot.cornerRadius),
    },
    sections: {
      headerH: s(layout.sections.headerH),
      textH: s(layout.sections.textH),
      mediaTop: s(layout.sections.mediaTop),
      quoteTop: layout.sections.quoteTop !== undefined ? s(layout.sections.quoteTop) : undefined,
      quoteH: layout.sections.quoteH !== undefined ? s(layout.sections.quoteH) : undefined,
    },
  };
}

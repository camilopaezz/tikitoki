import { join } from 'node:path';
import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { runFfmpeg } from '../../process/ffmpeg.js';
import { createLogger } from '../../util/logger.js';
import { computeBitrateBudget } from '../bitrate.js';
import { buildChromeHtml } from './chromeHtml.js';
import { buildXOverlayFiltergraph } from './filtergraph.js';
import { layoutXPost } from './layout.js';
import { cropChromePng, measureChromePng } from './measureChrome.js';
import { screenshotChrome } from './screenshotChrome.js';
import type { XPostLayout } from './types.js';

export interface RenderXPostOptions {
  jobId: string;
  assets: XPostAssets;
  jobDir: string;
  targetSizeMb?: number;
  /** Injectables for tests */
  screenshotFn?: typeof screenshotChrome;
  runFfmpegFn?: typeof runFfmpeg;
  measureFn?: typeof measureChromePng;
  cropFn?: typeof cropChromePng;
}

export interface RenderXPostResult {
  outputPath: string;
}

/**
 * Layout (media size) → flow chrome HTML → screenshot → measure green hole Y
 * → crop chrome → ffmpeg overlay of primary video + source audio.
 *
 * Text wrap is owned by Chromium. We never place the media hole from a
 * chars-per-line estimate (that caused empty gaps / clipped captions).
 */
export async function renderXPost(opts: RenderXPostOptions): Promise<RenderXPostResult> {
  const log = createLogger({ jobId: opts.jobId });
  const screenshotFn = opts.screenshotFn ?? screenshotChrome;
  const runFfmpegFn = opts.runFfmpegFn ?? runFfmpeg;
  const measureFn = opts.measureFn ?? measureChromePng;
  const cropFn = opts.cropFn ?? cropChromePng;

  let layout = layoutXPost(opts.assets);
  log.info(
    `xrender layout window ${layout.canvas.width}x${layout.canvas.height} media=${layout.mediaSlot.w}x${layout.mediaSlot.h} fit=${layout.mediaSlot.fit}`,
  );

  const html = buildChromeHtml(opts.assets, layout);
  const chromePath = await screenshotFn({
    html,
    jobDir: opts.jobDir,
    width: layout.canvas.width,
    height: layout.canvas.height,
    jobId: opts.jobId,
  });

  // Chromium laid out real text — read where the green hole landed.
  const measured = await measureFn(chromePath, { jobId: opts.jobId });
  layout = applyMeasuredChrome(layout, measured);
  log.info(
    `xrender measured hole x=${layout.mediaSlot.x} y=${layout.mediaSlot.y} ` +
      `canvas=${layout.canvas.width}x${layout.canvas.height} media=${layout.mediaSlot.w}x${layout.mediaSlot.h} ` +
      `(green ${measured.greenW}x${measured.greenH})`,
  );

  if (layout.canvas.height < layout.canvas.width) {
    // still fine
  }
  await cropFn(chromePath, layout.canvas.width, layout.canvas.height, { jobId: opts.jobId });

  const duration = opts.assets.primaryVideo.durationSec;
  let canvas = layout.canvas;
  let budget = computeBitrateBudget(opts.targetSizeMb ?? 45, duration, canvas.width, canvas.height);

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

function applyMeasuredChrome(
  layout: XPostLayout,
  measured: { x: number; y: number; contentHeight: number },
): XPostLayout {
  const evenDown = (n: number) => {
    const r = Math.round(n);
    return r % 2 === 0 ? r : r - 1;
  };
  // Prefer even dims for yuv420; never grow past the measured PNG crop height.
  const x = Math.max(0, evenDown(measured.x));
  const y = Math.max(0, evenDown(measured.y));
  const height = evenDown(measured.contentHeight);
  return {
    ...layout,
    canvas: { width: layout.canvas.width, height: Math.max(2, height) },
    mediaSlot: { ...layout.mediaSlot, x, y },
    sections: {
      ...layout.sections,
      mediaTop: y,
      headerH: Math.max(0, y - 12),
    },
  };
}

function scaleLayout(layout: XPostLayout, factor: number): XPostLayout {
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

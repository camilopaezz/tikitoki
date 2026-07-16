import { join } from 'node:path';
import { runFfmpeg } from '../process/ffmpeg.js';
import { createLogger } from '../util/logger.js';
import type { BitrateBudget } from './bitrate.js';
import type { Canvas } from './canvas.js';

const logger = createLogger();

export interface EncodeOptions {
  jobDir: string;
  inputs: string[];
  filterComplex: string;
  canvas: Canvas;
  budget: BitrateBudget;
  audioPath?: string;
  audioStartMs?: number;
  addSilentAudio: boolean;
  jobId?: string;
}

export interface EncodeResult {
  outputPath: string;
}

function buildInputArgs(opts: EncodeOptions): string[] {
  const args: string[] = [];
  const perSlideDuration = opts.budget.duration / opts.inputs.length;

  for (const input of opts.inputs) {
    args.push('-loop', '1', '-t', String(perSlideDuration), '-i', input);
  }

  if (opts.audioPath) {
    if (opts.audioStartMs && opts.audioStartMs > 0) {
      args.push('-ss', String(opts.audioStartMs / 1000));
    }
    args.push('-i', opts.audioPath);
  }

  if (opts.addSilentAudio) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
  }

  return args;
}

function buildOutputArgs(opts: EncodeOptions, pass: 1 | 2, outputPath?: string): string[] {
  const args: string[] = [];

  args.push('-filter_complex', opts.filterComplex);
  args.push('-map', '[out]');

  if (pass === 2) {
    if (opts.audioPath) {
      const audioIndex = opts.inputs.length;
      args.push('-map', `${audioIndex}:a`);
    } else if (opts.addSilentAudio) {
      const silentIndex = opts.inputs.length + (opts.audioPath ? 1 : 0);
      args.push('-map', `${silentIndex}:a`);
    }
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-b:v',
    String(opts.budget.videoBitrate),
    '-maxrate',
    String(Math.floor(opts.budget.videoBitrate * 1.5)),
    '-bufsize',
    String(opts.budget.videoBitrate * 2),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-r',
    '30',
  );

  if (pass === 2 && (opts.audioPath || opts.addSilentAudio)) {
    args.push('-c:a', 'aac', '-b:a', String(opts.budget.audioBitrate));
  } else if (pass === 1) {
    args.push('-an');
  }

  if (opts.audioPath || opts.addSilentAudio) {
    args.push('-shortest');
  }

  args.push('-pass', String(pass));
  args.push('-passlogfile', join(opts.jobDir, 'passlog'));

  if (pass === 1) {
    args.push('-f', 'null', '/dev/null');
  } else if (outputPath) {
    args.push('-y', outputPath);
  }

  return args;
}

export async function twoPassEncode(opts: EncodeOptions): Promise<EncodeResult> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const outputPath = join(opts.jobDir, 'out.mp4');

  const inputArgs = buildInputArgs(opts);

  log.debug(`Two-pass encode pass 1 (${opts.canvas.width}x${opts.canvas.height})`);
  const pass1Args = [...inputArgs, ...buildOutputArgs(opts, 1)];
  await runFfmpeg(pass1Args, { jobId: opts.jobId });

  log.debug(`Two-pass encode pass 2 -> ${outputPath}`);
  const pass2Args = [...inputArgs, ...buildOutputArgs(opts, 2, outputPath)];
  await runFfmpeg(pass2Args, { jobId: opts.jobId });

  return { outputPath };
}

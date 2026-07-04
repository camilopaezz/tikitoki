import { type RunOptions, type RunResult, runProcess } from './run.js';

export const FFMPEG_BIN = 'ffmpeg';

export function runFfmpeg(args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  return runProcess(FFMPEG_BIN, args, opts);
}

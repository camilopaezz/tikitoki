import { type RunOptions, type RunResult, runProcess } from './run.js';

export const YT_DLP_BIN = 'yt-dlp';

export function runYtDlp(args: readonly string[], opts: RunOptions = {}): Promise<RunResult> {
  return runProcess(YT_DLP_BIN, args, opts);
}

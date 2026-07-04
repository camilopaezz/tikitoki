import { runProcess } from '../process/run.js';
import { createLogger } from '../util/logger.js';

const logger = createLogger();

export interface Dimensions {
  width: number;
  height: number;
}

export async function probeImageDimensions(path: string, jobId?: string): Promise<Dimensions> {
  const log = jobId ? createLogger({ jobId }) : logger;
  log.debug(`Probing dimensions for ${path}`);

  // ffprobe is distributed with ffmpeg; it returns JSON metadata.
  const { stdout } = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    path,
  ]);

  const parsed = JSON.parse(stdout) as { streams?: Array<{ width: number; height: number }> };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error(`Could not probe dimensions for ${path}`);
  }

  return { width: stream.width, height: stream.height };
}

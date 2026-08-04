import { runProcess } from '../process/run.js';
import { createLogger } from '../util/logger.js';

const logger = createLogger();

export interface Dimensions {
  width: number;
  height: number;
}

export interface VideoProbe extends Dimensions {
  durationSec: number;
}

async function probeVideoStream(
  path: string,
  entries: string,
  jobId?: string,
): Promise<{ width?: number; height?: number; duration?: number }> {
  const log = jobId ? createLogger({ jobId }) : logger;
  log.debug(`Probing ${entries} for ${path}`);

  const { stdout } = await runProcess('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    entries,
    '-of',
    'json',
    path,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; duration?: string }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const durationRaw = stream?.duration ?? parsed.format?.duration;
  return {
    width: stream?.width,
    height: stream?.height,
    duration: durationRaw !== undefined ? Number(durationRaw) : undefined,
  };
}

export async function probeImageDimensions(path: string, jobId?: string): Promise<Dimensions> {
  const { width, height } = await probeVideoStream(path, 'stream=width,height', jobId);
  if (!width || !height) {
    throw new Error(`Could not probe dimensions for ${path}`);
  }
  return { width, height };
}

export async function probeVideo(path: string, jobId?: string): Promise<VideoProbe> {
  const { width, height, duration } = await probeVideoStream(
    path,
    'stream=width,height,duration:format=duration',
    jobId,
  );
  if (!width || !height) {
    throw new Error(`Could not probe video dimensions for ${path}`);
  }
  if (duration === undefined || Number.isNaN(duration) || duration <= 0) {
    throw new Error(`Could not probe video duration for ${path}`);
  }
  return { width, height, durationSec: duration };
}

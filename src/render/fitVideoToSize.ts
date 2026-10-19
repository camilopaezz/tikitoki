import { statSync } from 'node:fs';
import { join, parse } from 'node:path';
import { runFfmpeg } from '../process/ffmpeg.js';
import { createLogger } from '../util/logger.js';
import { MAX_VIDEO_BITRATE } from './bitrate.js';
import { probeVideo } from './probe.js';

export class OversizedVideoError extends Error {
  constructor(
    public readonly sizeBytes: number,
    public readonly maxBytes: number,
  ) {
    super(
      `Downloaded video is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB, exceeding the ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit.`,
    );
    this.name = 'OversizedVideoError';
  }
}

/** Preserve small downloads; transcode oversized ones with room for MP4 overhead. */
export async function fitVideoToSize(
  inputPath: string,
  maxSizeMb: number,
  jobId?: string,
): Promise<string> {
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (statSync(inputPath).size <= maxBytes) return inputPath;

  const log = createLogger(jobId ? { jobId } : {});
  const { width, height, durationSec } = await probeVideo(inputPath, jobId);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('Cannot compress a video without a finite positive duration');
  }
  const { dir, name } = parse(inputPath);
  const outputPath = join(dir, `${name}-compressed.mp4`);
  // Leave 5% for muxing overhead and bitrate variation, then retry lower if necessary.
  let totalBitrate = Math.floor((maxBytes * 8 * 0.95) / durationSec);
  let outputSize = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const audioBitrate = Math.max(16_000, Math.min(128_000, Math.floor(totalBitrate * 0.15)));
    const videoBitrate = Math.min(MAX_VIDEO_BITRATE, totalBitrate - audioBitrate);
    if (videoBitrate < 1_000) throw new OversizedVideoError(statSync(inputPath).size, maxBytes);

    // At most 720p, with fewer pixels for long clips whose size budget is tight.
    const scale = Math.min(
      1,
      1280 / Math.max(width, height),
      720 / Math.min(width, height),
      Math.sqrt(videoBitrate / (width * height * 30 * 0.08)),
    );
    // iw/ih describe the displayed frame after FFmpeg applies rotation metadata.
    const scaleFilter = `scale=w='max(2,trunc(iw*${scale}/2)*2)':h='max(2,trunc(ih*${scale}/2)*2)',fps=30`;
    const videoArgs = [
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      String(videoBitrate),
      '-passlogfile',
      `${outputPath}.passlog`,
    ];
    log.info(
      `Compressing oversized video with scale ${scale.toFixed(3)}, ${videoBitrate} bps (attempt ${attempt + 1})`,
    );
    await runFfmpeg(
      [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        ...videoArgs,
        '-pass',
        '1',
        '-an',
        '-f',
        'null',
        '/dev/null',
      ],
      { jobId },
    );
    await runFfmpeg(
      [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        ...videoArgs,
        '-pass',
        '2',
        '-c:a',
        'aac',
        '-b:a',
        String(audioBitrate),
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { jobId },
    );
    outputSize = statSync(outputPath).size;
    if (outputSize <= maxBytes) return outputPath;
    totalBitrate = Math.floor(totalBitrate * (maxBytes / outputSize) * 0.85);
  }
  throw new OversizedVideoError(outputSize, maxBytes);
}

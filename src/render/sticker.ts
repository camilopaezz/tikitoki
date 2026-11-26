import { join } from 'node:path';
import { runFfmpeg } from '../process/ffmpeg.js';
import { DEFAULT_X264_PRESET } from './x264.js';

/** WhatsApp stickers are square; its sticker maker crops video to 512x512. */
export const STICKER_SIZE_PX = 512;

/**
 * Fit the clip inside a 512x512 square, keeping its aspect ratio, with black bars.
 * WhatsApp's video-to-sticker tool drops alpha, so transparent padding gains nothing.
 */
export function stickerFilter(): string {
  const s = STICKER_SIZE_PX;
  return [
    `scale=${s}:${s}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${s}:${s}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  ].join(',');
}

export function stickerArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-an',
    '-vf',
    stickerFilter(),
    '-c:v',
    'libx264',
    '-preset',
    DEFAULT_X264_PRESET,
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ];
}

/** Convert a video or GIF into a square, silent MP4 for WhatsApp's sticker maker. */
export async function makeStickerVideo(
  inputPath: string,
  outDir: string,
  jobId?: string,
): Promise<string> {
  const outputPath = join(outDir, 'sticker.mp4');
  await runFfmpeg(stickerArgs(inputPath, outputPath), { jobId });
  return outputPath;
}

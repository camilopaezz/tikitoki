export interface BitrateBudget {
  targetSizeBytes: number;
  duration: number;
  videoBitrate: number;
  audioBitrate: number;
  needsDownscale: boolean;
}

// Quality floor: H.264 below this bitrate-per-pixel starts to look bad on
// high-resolution content. When the budget drops below the floor, we retry at
// 720p to keep quality acceptable while staying under the cap.
const QUALITY_FLOOR_BITS_PER_PIXEL_PER_FRAME = 0.08;
const FPS = 30;

export function computeBitrateBudget(
  targetSizeMb: number,
  duration: number,
  width: number,
  height: number,
): BitrateBudget {
  const targetSizeBytes = targetSizeMb * 1024 * 1024;
  const audioBitrate = 128_000; // 128 kbps AAC
  const totalBitrate = Math.floor((targetSizeBytes * 8) / duration);
  const videoBitrate = Math.max(1, totalBitrate - audioBitrate);

  const pixelsPerFrame = width * height;
  const floorBitrate = pixelsPerFrame * FPS * QUALITY_FLOOR_BITS_PER_PIXEL_PER_FRAME;
  const needsDownscale = videoBitrate < floorBitrate;

  return {
    targetSizeBytes,
    duration,
    videoBitrate,
    audioBitrate,
    needsDownscale,
  };
}

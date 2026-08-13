export interface BitrateBudget {
  duration: number;
  videoBitrate: number;
  audioBitrate: number;
  needsDownscale: boolean;
}

// Size-pressure floor only: if target_size/duration is below this bpp at full
// res, downscale so the *size* budget still looks OK. Not applied to short
// clips (they hit MAX_VIDEO_BITRATE instead and stay full res).
const QUALITY_FLOOR_BITS_PER_PIXEL_PER_FRAME = 0.08;
const FPS = 30;
// Size budget alone fills ~45 MB for short clips (e.g. 10s → ~36 Mbps).
// Cap so we don't ship fat files that re-compress worse on WhatsApp/forwards.
const MAX_VIDEO_BITRATE = 4_000_000; // 4 Mbps — solid 1080p phone quality

export function computeBitrateBudget(
  targetSizeMb: number,
  duration: number,
  width: number,
  height: number,
): BitrateBudget {
  const targetSizeBytes = targetSizeMb * 1024 * 1024;
  const audioBitrate = 128_000; // 128 kbps AAC
  const totalBitrate = Math.floor((targetSizeBytes * 8) / duration);
  const sizeBudgetVideo = Math.max(1, totalBitrate - audioBitrate);

  const pixelsPerFrame = width * height;
  const floorBitrate = pixelsPerFrame * FPS * QUALITY_FLOOR_BITS_PER_PIXEL_PER_FRAME;
  // Downscale only when size pressure is real — not when MAX_VIDEO_BITRATE binds.
  const needsDownscale = sizeBudgetVideo < floorBitrate;
  const videoBitrate = Math.min(sizeBudgetVideo, MAX_VIDEO_BITRATE);

  return {
    duration,
    videoBitrate,
    audioBitrate,
    needsDownscale,
  };
}

import { readFile } from 'node:fs/promises';
import { runProcess } from '../../process/run.js';
import { decodePng, UnsupportedPngError } from '../png.js';

export interface GreenHoleMeasure {
  /** Left edge of solid green media hole (canvas X). */
  x: number;
  /** Top edge of solid green media hole (canvas Y). */
  y: number;
  /** Cropped content height (last non-empty row + pad, even, ≤ PNG height). */
  contentHeight: number;
  /** Detected green width (diagnostic). */
  greenW: number;
  /** Detected green height (diagnostic). */
  greenH: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  /** Tightly packed RGBA. */
  rgba: Uint8Array;
}

const DEFAULT_BOTTOM_PAD = 44;

/**
 * True for solid chromakey green (#00FF00). Anti-aliased fringe is ignored so
 * the bbox sits on the hole interior; we only need Y, not a perfect rect.
 */
function isKeyGreen(r: number, g: number, b: number): boolean {
  return g >= 240 && r <= 40 && b <= 40;
}

function isNearBlack(r: number, g: number, b: number, a: number): boolean {
  if (a < 8) return true;
  return r <= 12 && g <= 12 && b <= 12;
}

/** Pure pixel scan — exposed for tests. */
export function measureChromeRgba(
  img: RgbaImage,
  bottomPad = DEFAULT_BOTTOM_PAD,
): GreenHoleMeasure {
  const { width, height, rgba: buf } = img;
  let minY = height;
  let maxY = -1;
  let minX = width;
  let maxX = -1;
  let lastContentY = -1;

  for (let y = 0; y < height; y++) {
    let rowHasContent = false;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const a = buf[i + 3];
      if (isKeyGreen(r, g, b)) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        rowHasContent = true;
      } else if (!rowHasContent && !isNearBlack(r, g, b, a)) {
        rowHasContent = true;
      }
    }
    if (rowHasContent) lastContentY = y;
  }

  if (maxY < 0 || minY >= height) {
    throw new Error('No chromakey green media hole found in chrome PNG');
  }
  if (lastContentY < 0) {
    throw new Error('Chrome PNG appears empty');
  }

  // Even crop height that never exceeds the source PNG (ffmpeg crop would fail).
  const rawH = Math.max(lastContentY + 1 + bottomPad, maxY + 1 + bottomPad);
  const clamped = Math.min(height, rawH + (rawH % 2));
  const contentHeight = clamped % 2 === 0 ? clamped : clamped - 1;

  return {
    x: minX,
    y: minY,
    contentHeight: Math.max(2, contentHeight),
    greenW: maxX - minX + 1,
    greenH: maxY - minY + 1,
  };
}

/** ffmpeg decode path for PNGs the in-process reader does not handle. */
async function decodeWithFfmpeg(pngPath: string, jobId?: string): Promise<RgbaImage> {
  const probe = await runProcess(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      pngPath,
    ],
    { jobId },
  );
  const [ws, hs] = probe.stdout.trim().split(',');
  const width = Number(ws);
  const height = Number(hs);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error(`Could not probe chrome PNG size: ${probe.stdout.trim()}`);
  }
  const rawPath = `${pngPath}.rgba`;
  await runProcess('ffmpeg', ['-y', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', rawPath], {
    jobId,
  });
  return { width, height, rgba: await readFile(rawPath) };
}

/**
 * Measure media-hole position and content height from a rasterized chrome PNG.
 * Chromium owns text wrap; we only need where the green hole landed and where
 * content ends so ffmpeg overlay + canvas height match reality.
 *
 * Decodes in-process (Chromium emits 8-bit RGB/RGBA); falls back to ffmpeg for
 * anything exotic.
 */
export async function measureChromePng(
  pngPath: string,
  opts?: { jobId?: string; bottomPad?: number },
): Promise<GreenHoleMeasure> {
  const buf = await readFile(pngPath);
  let img: RgbaImage;
  try {
    img = decodePng(buf);
  } catch (err) {
    if (!(err instanceof UnsupportedPngError)) throw err;
    img = await decodeWithFfmpeg(pngPath, opts?.jobId);
  }
  return measureChromeRgba(img, opts?.bottomPad);
}

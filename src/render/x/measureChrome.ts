import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { runProcess } from '../../process/run.js';

export interface GreenHoleMeasure {
  /** Left edge of solid green media hole (canvas X). */
  x: number;
  /** Top edge of solid green media hole (canvas Y). */
  y: number;
  /** Cropped content height (last non-empty row + pad, even). */
  contentHeight: number;
  /** Detected green width (diagnostic). */
  greenW: number;
  /** Detected green height (diagnostic). */
  greenH: number;
}

function even(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

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

/**
 * Measure media-hole Y and content height from a rasterized chrome PNG.
 * Chromium owns text wrap; we only need where the green hole landed and where
 * content ends so ffmpeg overlay + canvas height match reality.
 */
export async function measureChromePng(
  pngPath: string,
  opts?: { jobId?: string; bottomPad?: number },
): Promise<GreenHoleMeasure> {
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
    { jobId: opts?.jobId },
  );
  const [ws, hs] = probe.stdout.trim().split(',');
  const width = Number(ws);
  const height = Number(hs);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error(`Could not probe chrome PNG size: ${probe.stdout.trim()}`);
  }

  const rawPath = join(pngPath, '..', 'chrome.raw.rgba');
  await runProcess('ffmpeg', ['-y', '-i', pngPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', rawPath], {
    jobId: opts?.jobId,
  });
  const buf = await readFile(rawPath);

  let minY = height;
  let maxY = -1;
  let minX = width;
  let maxX = -1;
  let lastContentY = -1;

  for (let y = 0; y < height; y++) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = buf[i] ?? 0;
      const g = buf[i + 1] ?? 0;
      const b = buf[i + 2] ?? 0;
      const a = buf[i + 3] ?? 0;
      if (isKeyGreen(r, g, b)) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        rowHasContent = true;
      } else if (!isNearBlack(r, g, b, a)) {
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

  const bottomPad = opts?.bottomPad ?? 44;
  // Never exceed the source PNG — even() rounding can otherwise request a
  // crop taller than the screenshot (ffmpeg crop fails).
  const rawH = Math.max(lastContentY + 1 + bottomPad, maxY + 1 + bottomPad);
  const contentHeight = Math.min(height, even(rawH));
  // If even() would need height+1 past the PNG, step down to the next even.
  const safeH =
    contentHeight <= height
      ? contentHeight % 2 === 0
        ? contentHeight
        : contentHeight - 1
      : height % 2 === 0
        ? height
        : height - 1;

  return {
    x: minX,
    y: minY,
    contentHeight: Math.max(2, safeH),
    greenW: maxX - minX + 1,
    greenH: maxY - minY + 1,
  };
}

/**
 * Crop chrome PNG to `height` (full width), in place.
 */
export async function cropChromePng(
  pngPath: string,
  width: number,
  height: number,
  opts?: { jobId?: string },
): Promise<void> {
  // Probe source so we never request a crop larger than the input.
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
    { jobId: opts?.jobId },
  );
  const [ws, hs] = probe.stdout.trim().split(',');
  const srcW = Number(ws);
  const srcH = Number(hs);
  const cropW = Math.min(width, srcW);
  let cropH = Math.min(height, srcH);
  if (cropH % 2 !== 0) cropH -= 1;
  if (cropW < 2 || cropH < 2) {
    throw new Error(`Invalid chrome crop ${cropW}x${cropH} from ${srcW}x${srcH}`);
  }
  if (cropW === srcW && cropH === srcH) {
    return; // nothing to do
  }

  const tmp = join(pngPath, '..', 'chrome.cropped.png');
  await runProcess(
    'ffmpeg',
    ['-y', '-i', pngPath, '-vf', `crop=${cropW}:${cropH}:0:0,setsar=1`, '-frames:v', '1', tmp],
    { jobId: opts?.jobId },
  );
  await rename(tmp, pngPath);
}

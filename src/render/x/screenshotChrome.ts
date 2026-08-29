import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProcessError, ProcessTimeoutError, runProcess } from '../../process/run.js';
import { createLogger } from '../../util/logger.js';
import { injectChirpFontCss, loadChirpFontFaceCss } from './chirpFonts.js';

const logger = createLogger();

export interface ScreenshotChromeOptions {
  html: string;
  jobDir: string;
  width: number;
  height: number;
  jobId?: string;
  /** Override binary for tests. */
  chromiumBin?: string;
}

const CANDIDATE_BINS = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

/** Chromium `--timeout` is milliseconds (hard cap inside the browser). */
export const CHROME_TIMEOUT_MS = 15_000;
/** Fast-forward local HTML paint, then screenshot. Milliseconds. */
export const CHROME_VIRTUAL_TIME_MS = 5_000;
/**
 * Node-side kill if Chromium ignores `--timeout` (`--headless=new` can hang
 * forever on WebUI / on-device-model services). Slightly above the Chromium cap.
 */
export const CHROME_PROCESS_TIMEOUT_MS = 20_000;

async function pngExists(pngPath: string): Promise<boolean> {
  try {
    await access(pngPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveChromium(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  for (const bin of CANDIDATE_BINS) {
    try {
      await runProcess('which', [bin]);
      return bin;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No Chromium/Chrome binary found for xrender chrome screenshot (install chromium)',
  );
}

/**
 * Rasterize chrome HTML to PNG via headless Chromium.
 * Output path: `<jobDir>/xchrome/chrome.png`
 */
export async function screenshotChrome(opts: ScreenshotChromeOptions): Promise<string> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const chromeDir = join(opts.jobDir, 'xchrome');
  const htmlPath = join(chromeDir, 'chrome.html');
  const pngPath = join(chromeDir, 'chrome.png');
  const userDataDir = join(chromeDir, 'user-data');

  await mkdir(userDataDir, { recursive: true });
  let html = opts.html;
  try {
    html = injectChirpFontCss(html, await loadChirpFontFaceCss({ jobId: opts.jobId }));
  } catch (err) {
    log.warn(`Chirp fonts unavailable; using system fallback: ${(err as Error).message}`);
  }
  await writeFile(htmlPath, html, 'utf8');

  const bin = await resolveChromium(opts.chromiumBin);
  const fileUrl = `file://${htmlPath}`;

  log.debug(`Screenshot chrome with ${bin} ${opts.width}x${opts.height}`);

  // window-size must fit the card; --screenshot writes viewport capture.
  // `--headless=new` can idle forever (WebUI / OnDeviceModel). Cap both inside
  // Chromium and in Node, and isolate the profile so jobs cannot share it.
  const chromeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-breakpad',
    '--disable-features=OnDeviceModel,OptimizationGuideOnDeviceModel',
    `--virtual-time-budget=${CHROME_VIRTUAL_TIME_MS}`,
    `--timeout=${CHROME_TIMEOUT_MS}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${pngPath}`,
    fileUrl,
  ];
  try {
    await runProcess(bin, chromeArgs, { jobId: opts.jobId, timeoutMs: CHROME_PROCESS_TIMEOUT_MS });
  } catch (err) {
    // Chromium `--timeout` may still write the PNG then exit non-zero.
    if (await pngExists(pngPath)) {
      log.warn(`Chromium exited non-zero but wrote ${pngPath}: ${(err as Error).message}`);
    } else if (err instanceof ProcessTimeoutError) {
      throw err;
    } else {
      log.error(`Chromium screenshot failed: ${(err as Error).message}`);
      throw new ProcessTimeoutError(
        err instanceof ProcessError ? err.command : bin,
        err instanceof ProcessError ? err.args : chromeArgs,
        CHROME_PROCESS_TIMEOUT_MS,
      );
    }
  }

  // Force exact canvas size (Chromium can emit slightly different screenshot dims).
  const scaledPath = join(chromeDir, 'chrome.scaled.png');
  await runProcess('ffmpeg', [
    '-y',
    '-i',
    pngPath,
    '-vf',
    `scale=${opts.width}:${opts.height}:flags=neighbor,setsar=1`,
    '-frames:v',
    '1',
    scaledPath,
  ]);
  await rename(scaledPath, pngPath);

  return pngPath;
}

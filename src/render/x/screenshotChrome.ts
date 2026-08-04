import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runProcess } from '../../process/run.js';
import { createLogger } from '../../util/logger.js';

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

  await writeFile(htmlPath, opts.html, 'utf8');

  const bin = await resolveChromium(opts.chromiumBin);
  const fileUrl = `file://${htmlPath}`;

  log.debug(`Screenshot chrome with ${bin} ${opts.width}x${opts.height}`);

  // window-size must fit the card; --screenshot writes viewport capture.
  await runProcess(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${opts.width},${opts.height}`,
    `--screenshot=${pngPath}`,
    fileUrl,
  ]);

  return pngPath;
}

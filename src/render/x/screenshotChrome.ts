import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProcessError, ProcessTimeoutError, runProcess } from '../../process/run.js';
import { createLogger } from '../../util/logger.js';
import { readPngSize } from '../png.js';
import { injectChirpFontCss, loadChirpFontFaceCss } from './chirpFonts.js';
import { type CdpBrowser, withSharedBrowser } from './chromiumBrowser.js';

const logger = createLogger();

export interface ScreenshotChromeOptions {
  html: string;
  jobDir: string;
  width: number;
  height: number;
  jobId?: string;
  /** Override binary for tests. */
  chromiumBin?: string;
  /**
   * Reuse one long-lived Chromium over CDP (default) instead of spawning a
   * browser per screenshot. Falls back to the one-shot CLI on any failure.
   * `TIKITOKI_CHROME_ONESHOT=1` forces the CLI path.
   */
  persistent?: boolean;
  /** Test seam for the persistent path. */
  withBrowser?: <T>(
    bin: string,
    args: readonly string[],
    fn: (browser: Pick<CdpBrowser, 'screenshot'>) => Promise<T>,
  ) => Promise<T>;
}

const CANDIDATE_BINS = [
  'chromium-headless-shell',
  'chrome-headless-shell',
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
];

/** Chromium `--timeout` is milliseconds (hard cap inside the browser). */
export const CHROME_TIMEOUT_MS = 15_000;
/** Fast-forward local HTML paint, then screenshot. Milliseconds. */
export const CHROME_VIRTUAL_TIME_MS = 5_000;
/**
 * Node-side kill if Chromium ignores `--timeout` (full `--headless=new` can hang
 * forever on WebUI / on-device-model services). Slightly above the Chromium cap.
 */
export const CHROME_PROCESS_TIMEOUT_MS = 20_000;

function isHeadlessShell(bin: string): boolean {
  return bin.includes('headless-shell');
}

async function pngExists(pngPath: string): Promise<boolean> {
  try {
    await access(pngPath);
    return true;
  } catch {
    return false;
  }
}

let resolvedBin: Promise<string> | undefined;

async function findChromium(): Promise<string> {
  for (const bin of CANDIDATE_BINS) {
    try {
      await runProcess('which', [bin]);
      return bin;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No Chromium/Chrome binary found for xrender chrome screenshot (install chromium-headless-shell or chromium)',
  );
}

/** PATH lookup once per process (it does not change under a running bot). */
async function resolveChromium(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  resolvedBin ??= findChromium().catch((err: unknown) => {
    resolvedBin = undefined;
    throw err;
  });
  return resolvedBin;
}

/** Exposed for tests: forget the memoized binary lookup. */
export function resetChromiumLookup(): void {
  resolvedBin = undefined;
}

/**
 * Flags shared by both paths. chrome-headless-shell is already old-headless;
 * `--headless=new` would be the full browser. SwiftShader replaces the
 * Mesa/LLVM GPU stack we strip in Docker. Full `--headless=new` can idle
 * forever (WebUI / OnDeviceModel), hence the disabled features.
 */
function baseChromeArgs(bin: string): string[] {
  return [
    ...(isHeadlessShell(bin) ? ['--headless', '--enable-unsafe-swiftshader'] : ['--headless=new']),
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-breakpad',
    '--disable-features=OnDeviceModel,OptimizationGuideOnDeviceModel',
  ];
}

function persistentByDefault(): boolean {
  return process.env.TIKITOKI_CHROME_ONESHOT !== '1';
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

  await mkdir(chromeDir, { recursive: true });
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

  let png: Buffer | undefined;
  if (opts.persistent ?? persistentByDefault()) {
    const withBrowser = opts.withBrowser ?? withSharedBrowser;
    try {
      png = await withBrowser(bin, baseChromeArgs(bin), (browser) =>
        browser.screenshot({
          url: fileUrl,
          width: opts.width,
          height: opts.height,
          timeoutMs: CHROME_TIMEOUT_MS,
        }),
      );
      await writeFile(pngPath, png);
    } catch (err) {
      png = undefined;
      log.warn(`Shared Chromium screenshot failed, using one-shot CLI: ${(err as Error).message}`);
    }
  }
  if (!png) {
    await screenshotOneShot(bin, fileUrl, pngPath, opts, log);
    png = await readFile(pngPath);
  }

  // Force exact canvas size (Chromium can emit slightly different screenshot
  // dims). Almost always already exact, so check the header before spawning.
  let sizeOk = false;
  try {
    const size = readPngSize(png);
    sizeOk = size.width === opts.width && size.height === opts.height;
  } catch {
    // unreadable header → let ffmpeg normalize it
  }
  if (!sizeOk) {
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
  }

  return pngPath;
}

/**
 * One Chromium process per screenshot (`--screenshot`). Cap both inside
 * Chromium and in Node, and isolate the profile so jobs cannot share it.
 */
async function screenshotOneShot(
  bin: string,
  fileUrl: string,
  pngPath: string,
  opts: ScreenshotChromeOptions,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const userDataDir = join(opts.jobDir, 'xchrome', 'user-data');
  await mkdir(userDataDir, { recursive: true });
  // window-size must fit the card; --screenshot writes viewport capture.
  const chromeArgs = [
    ...baseChromeArgs(bin),
    // A headless "command" switch (rejected alongside remote debugging); the
    // CDP path sets the same transparent default via Emulation instead.
    '--default-background-color=00000000',
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
}

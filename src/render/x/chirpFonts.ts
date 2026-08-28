import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { downloadFile } from '../../fetch/downloadFile.js';
import { createLogger } from '../../util/logger.js';
import { JOB_TMP_ROOT } from '../../util/tmp.js';

const logger = createLogger();

/** Live x.com latin unicode-range (abs.twimg.com CSS, 2026-08-27). */
const LATIN_UNICODE_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

/**
 * Live x.com latin subsets. Filename includes the URL content hash so a URL
 * bump invalidates the on-disk cache.
 */
export const CHIRP_FACES = [
  {
    file: 'Chirp-Regular.c88864db.woff2',
    weight: 400,
    url: 'https://abs.twimg.com/fonts/subset/Chirp-Regular.c88864db.latin.woff2',
    unicodeRange: LATIN_UNICODE_RANGE,
  },
  {
    file: 'Chirp-Bold.d8ac01b2.woff2',
    weight: 700,
    url: 'https://abs.twimg.com/fonts/subset/Chirp-Bold.d8ac01b2.latin.woff2',
    unicodeRange: LATIN_UNICODE_RANGE,
  },
] as const;

const WOFF2_MAGIC = Buffer.from('wOF2');
const MIN_WOFF2_BYTES = 1024;

export interface ChirpFaceBytes {
  file: string;
  weight: number;
  unicodeRange: string;
  bytes: Buffer;
}

const inflight = new Map<string, Promise<Buffer>>();
let memoCss: Promise<string> | undefined;

export function defaultChirpCacheDir(): string {
  if (process.env.TIKITOKI_CHIRP_DIR) return process.env.TIKITOKI_CHIRP_DIR;
  return join(process.cwd(), 'assets', 'fonts');
}

export function defaultChirpFallbackDir(): string {
  return join(JOB_TMP_ROOT, 'fonts');
}

export function chirpFontFaceCss(faces: readonly ChirpFaceBytes[]): string {
  return faces
    .map((face) => {
      const uri = `data:font/woff2;base64,${face.bytes.toString('base64')}`;
      return `  @font-face {
    font-family: TwitterChirp;
    src: url("${uri}") format("woff2");
    font-weight: ${face.weight};
    font-style: normal;
    font-display: swap;
    unicode-range: ${face.unicodeRange};
  }`;
    })
    .join('\n');
}

export function injectChirpFontCss(html: string, css: string): string {
  if (!css) return html;
  return html.replace('<style>', `<style>\n${css}`);
}

function isWoff2(buf: Buffer): boolean {
  return buf.length >= MIN_WOFF2_BYTES && buf.subarray(0, 4).equals(WOFF2_MAGIC);
}

function isPermissionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}

async function readValidWoff2(path: string): Promise<Buffer | undefined> {
  try {
    const buf = await readFile(path);
    return isWoff2(buf) ? buf : undefined;
  } catch {
    return undefined;
  }
}

async function downloadTo(
  dest: string,
  url: string,
  downloadFn: (url: string, dest: string) => Promise<void>,
): Promise<Buffer> {
  let pending = inflight.get(dest);
  if (!pending) {
    pending = (async () => {
      await mkdir(dirname(dest), { recursive: true });
      const part = `${dest}.${process.pid}.${randomBytes(8).toString('hex')}.part`;
      try {
        await downloadFn(url, part);
        const buf = await readFile(part);
        if (!isWoff2(buf)) {
          throw new Error(`Chirp download was not a woff2: ${dest}`);
        }
        await rename(part, dest);
        return buf;
      } catch (err) {
        await unlink(part).catch(() => undefined);
        throw err;
      }
    })().finally(() => {
      inflight.delete(dest);
    });
    inflight.set(dest, pending);
  }
  return pending;
}

export interface EnsureChirpFontsOptions {
  cacheDir?: string;
  fallbackDir?: string;
  downloadFn?: (url: string, dest: string) => Promise<void>;
  jobId?: string;
}

async function loadOneFace(
  face: (typeof CHIRP_FACES)[number],
  preferred: string,
  fallback: string,
  downloadFn: (url: string, dest: string) => Promise<void>,
  log: ReturnType<typeof createLogger>,
): Promise<ChirpFaceBytes> {
  const dirs = preferred === fallback ? [preferred] : [preferred, fallback];
  for (const dir of dirs) {
    const cached = await readValidWoff2(join(dir, face.file));
    if (cached)
      return {
        file: face.file,
        weight: face.weight,
        unicodeRange: face.unicodeRange,
        bytes: cached,
      };
  }

  log.info(`Fetching Chirp ${face.weight} from abs.twimg.com`);
  try {
    const bytes = await downloadTo(join(preferred, face.file), face.url, downloadFn);
    return { file: face.file, weight: face.weight, unicodeRange: face.unicodeRange, bytes };
  } catch (err) {
    if (!isPermissionError(err) || preferred === fallback) throw err;
    const bytes = await downloadTo(join(fallback, face.file), face.url, downloadFn);
    return { file: face.file, weight: face.weight, unicodeRange: face.unicodeRange, bytes };
  }
}

/** Load Regular 400 + Bold 700 Chirp latin woff2s, downloading on cache miss. */
export async function ensureChirpFonts(
  opts: EnsureChirpFontsOptions = {},
): Promise<ChirpFaceBytes[]> {
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  const preferred = opts.cacheDir ?? defaultChirpCacheDir();
  const fallback = opts.fallbackDir ?? (opts.cacheDir ? preferred : defaultChirpFallbackDir());
  const downloadFn =
    opts.downloadFn ?? ((url, dest) => downloadFile(url, dest, { jobId: opts.jobId }));

  return Promise.all(
    CHIRP_FACES.map((face) => loadOneFace(face, preferred, fallback, downloadFn, log)),
  );
}

/**
 * Process-lifetime memo of the data-URI @font-face CSS. Test callers that pass
 * cacheDir/downloadFn bypass the memo so they stay isolated.
 */
export async function loadChirpFontFaceCss(opts: EnsureChirpFontsOptions = {}): Promise<string> {
  const bypassMemo = Boolean(opts.cacheDir || opts.fallbackDir || opts.downloadFn);
  if (bypassMemo) {
    return chirpFontFaceCss(await ensureChirpFonts(opts));
  }
  if (!memoCss) {
    memoCss = ensureChirpFonts(opts)
      .then(chirpFontFaceCss)
      .catch((err: unknown) => {
        memoCss = undefined;
        throw err;
      });
  }
  return memoCss;
}

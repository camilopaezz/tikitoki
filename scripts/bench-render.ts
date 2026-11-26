/**
 * Offline render benchmark: X feed cards, slideshows, and oversized-video fit.
 *
 * Generates deterministic synthetic fixtures (no network, no cookies), drives
 * the public render entry points, and reports median wall time per case.
 *
 * Usage:
 *   pnpm bench:render                       # all cases, 3 runs each
 *   pnpm bench:render --runs 5 --only x-landscape-15s,ss-10x-audio
 *   pnpm bench:render --quality             # + SSIM/PSNR vs a lossless reference
 *   pnpm bench:render --out /tmp/bench --label after
 *
 * `--quality` re-renders every case once through an ffmpeg shim that keeps the
 * exact filtergraph but swaps rate control for lossless `-qp 0` (and skips
 * 2-pass pass 1). SSIM/PSNR of the real output against that reference is pure
 * encode loss; `uniqueFrames` (mpdecimate on the lossless reference) shows how
 * many distinct frames the compositor produced, i.e. motion smoothness.
 *
 * Needs ffmpeg with libx264 and Chromium on PATH (use the Docker image).
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { XPostAssets } from '../src/fetch/downloadXAssets.js';
import { fitVideoToSize } from '../src/render/fitVideoToSize.js';
import { renderSlideshow } from '../src/render/renderSlideshow.js';
import { renderXPost } from '../src/render/x/renderXPost.js';
import { perJobDir, rmJobDir } from '../src/util/tmp.js';

interface Args {
  outDir: string;
  runs: number;
  only?: Set<string>;
  quality: boolean;
  label: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    outDir: resolve('bench-out/render'),
    runs: 3,
    quality: false,
    label: 'run',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) throw new Error(`${a} requires a value`);
      return v;
    };
    if (a === '--') continue;
    else if (a === '--out' || a === '-o') args.outDir = resolve(next());
    else if (a === '--runs' || a === '-n') args.runs = Math.max(1, Number(next()));
    else if (a === '--only') args.only = new Set(next().split(','));
    else if (a === '--quality' || a === '-q') args.quality = true;
    else if (a === '--label' || a === '-l') args.label = next();
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function ff(args: string[]): string {
  return execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Run ffmpeg and return its stderr (filter stats such as ssim/psnr/showinfo). */
function ffStats(args: string[]): string {
  const res = execFileSync(
    'sh',
    ['-c', 'ffmpeg -hide_banner -nostats "$@" 2>&1 >/dev/null', 'sh', ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return res;
}

// ---------------------------------------------------------------- fixtures

function fixture(dir: string, name: string, make: (path: string) => void): string {
  const path = join(dir, name);
  if (!existsSync(path)) make(path);
  return path;
}

/** Moving test pattern + temporal grain so x264 has real work to do. */
function makeVideo(path: string, w: number, h: number, fps: number, seconds: number) {
  ff([
    '-f',
    'lavfi',
    '-i',
    `testsrc2=s=${w}x${h}:r=${fps}:d=${seconds},noise=alls=6:allf=t+u`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:sample_rate=44100:duration=${seconds}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '16',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    path,
  ]);
}

function makeImage(path: string, w: number, h: number, seed: number) {
  // Alternate between a fractal (fine detail) and a gradient field (smooth).
  const src =
    seed % 2 === 0
      ? `mandelbrot=s=${w}x${h}:start_scale=${(3 / (seed + 1)).toFixed(3)}:end_pts=1`
      : `gradients=s=${w}x${h}:n=4:seed=${seed}`;
  ff(['-f', 'lavfi', '-i', src, '-frames:v', '1', '-q:v', '2', path]);
}

function makeAudio(path: string, seconds: number) {
  ff([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=330:sample_rate=44100:duration=${seconds}`,
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    path,
  ]);
}

interface Fixtures {
  land15: string;
  port60: string;
  land120: string;
  big1080: string;
  avatar: string;
  avatarQuote: string;
  quoteImgs: string[];
  slides: string[];
  slidesMixed: string[];
  audio30: string;
}

function buildFixtures(dir: string): Fixtures {
  mkdirSync(dir, { recursive: true });
  return {
    land15: fixture(dir, 'land-1280x720-30fps-15s.mp4', (p) => makeVideo(p, 1280, 720, 30, 15)),
    port60: fixture(dir, 'port-720x1280-60fps-20s.mp4', (p) => makeVideo(p, 720, 1280, 60, 20)),
    land120: fixture(dir, 'land-1280x720-30fps-120s.mp4', (p) => makeVideo(p, 1280, 720, 30, 120)),
    big1080: fixture(dir, 'big-1920x1080-30fps-20s.mp4', (p) => makeVideo(p, 1920, 1080, 30, 20)),
    avatar: fixture(dir, 'avatar.jpg', (p) => makeImage(p, 400, 400, 2)),
    avatarQuote: fixture(dir, 'avatar-quote.jpg', (p) => makeImage(p, 400, 400, 3)),
    quoteImgs: [0, 1].map((i) =>
      fixture(dir, `quote-img-${i}.jpg`, (p) => makeImage(p, 1200, 675, 4 + i)),
    ),
    slides: Array.from({ length: 10 }, (_, i) =>
      fixture(dir, `slide-1080x1920-${i}.jpg`, (p) => makeImage(p, 1080, 1920, i)),
    ),
    slidesMixed: Array.from({ length: 4 }, (_, i) =>
      fixture(dir, `slide-mixed-${i}.jpg`, (p) =>
        makeImage(p, i % 2 ? 1080 : 1440, i % 2 ? 1350 : 1080, 10 + i),
      ),
    ),
    audio30: fixture(dir, 'audio-30s.m4a', (p) => makeAudio(p, 30)),
  };
}

// ---------------------------------------------------------------- cases

interface CaseRun {
  outputPath: string;
  detail?: Record<string, number>;
  cleanup: () => void;
}

interface BenchCase {
  name: string;
  /** Source fps, when the output should be smooth video. */
  sourceFps?: number;
  run: () => Promise<CaseRun>;
  /** Lossless reference built outside the code under test (fit case). */
  externalRef?: (output: string, refPath: string) => void;
}

const LONG_TEXT =
  'Shipping the new render path today 🚀 — chrome is rasterized once, the video is composited ' +
  'at its native frame rate, and the encoder only runs once when the size budget has headroom. ' +
  'Here is a longer caption so the text wraps across several lines like a real post would.';

function xAssets(
  f: Fixtures,
  video: string,
  w: number,
  h: number,
  dur: number,
  kind: XPostAssets['layoutKind'],
  withQuote: 'none' | 'text' | 'images' | 'video',
): XPostAssets {
  const quote =
    withQuote === 'none'
      ? undefined
      : {
          author: {
            name: 'Quoted Account',
            handle: 'quoted',
            avatarPath: f.avatarQuote,
            verified: false,
          },
          text: {
            text: 'The quoted post text that sits inside the nested card.',
            displayText: 'The quoted post text that sits inside the nested card.',
          },
          images: withQuote === 'images' ? f.quoteImgs.map((path) => ({ path })) : [],
          statusId: '2',
        };
  return {
    layoutKind: kind,
    statusId: '1',
    sourceUrl: 'https://x.com/bench/status/1',
    outer: {
      author: { name: 'Bench Author', handle: 'bench', avatarPath: f.avatar, verified: true },
      text: { text: LONG_TEXT, displayText: LONG_TEXT },
    },
    primaryVideo: { path: video, width: w, height: h, durationSec: dur },
    quote,
  };
}

function xCase(name: string, sourceFps: number, assets: XPostAssets): BenchCase {
  return {
    name,
    sourceFps,
    run: async () => {
      const jobId = `bench-${randomUUID()}`;
      const jobDir = perJobDir(jobId);
      const res = await renderXPost({ jobId, assets, jobDir, targetSizeMb: 45 });
      return { outputPath: res.outputPath, detail: res.timings, cleanup: () => rmJobDir(jobId) };
    },
  };
}

function cases(f: Fixtures): BenchCase[] {
  return [
    xCase('x-landscape-15s', 30, xAssets(f, f.land15, 1280, 720, 15, 'simple_video', 'none')),
    xCase(
      'x-portrait60-quote-imgs-20s',
      60,
      xAssets(f, f.port60, 720, 1280, 20, 'video_quotes', 'images'),
    ),
    xCase(
      'x-quote-of-video-15s',
      30,
      xAssets(f, f.land15, 1280, 720, 15, 'quote_of_video', 'video'),
    ),
    xCase(
      'x-landscape-120s-2pass',
      30,
      xAssets(f, f.land120, 1280, 720, 120, 'simple_video', 'text'),
    ),
    {
      name: 'ss-10x-1080x1920-audio30s',
      run: async () => {
        const jobId = `bench-${randomUUID()}`;
        const res = await renderSlideshow({
          jobId,
          images: f.slides,
          audioPath: f.audio30,
          audioDuration: 30,
          targetSizeMb: 45,
          crossfadeSeconds: 0.4,
        });
        return { outputPath: res.outputPath, cleanup: () => rmJobDir(jobId) };
      },
    },
    {
      name: 'ss-4x-mixed-silent',
      run: async () => {
        const jobId = `bench-${randomUUID()}`;
        const res = await renderSlideshow({
          jobId,
          images: f.slidesMixed,
          targetSizeMb: 45,
          crossfadeSeconds: 0.4,
          silentSlideSeconds: 5,
        });
        return { outputPath: res.outputPath, cleanup: () => rmJobDir(jobId) };
      },
    },
    {
      name: 'fit-1080p-20s-to-6MB',
      sourceFps: 30,
      run: async () => {
        const jobId = `bench-${randomUUID()}`;
        const dir = perJobDir(jobId);
        const input = join(dir, 'input.mp4');
        execFileSync('cp', [f.big1080, input]);
        const out = await fitVideoToSize(input, 6, jobId);
        return { outputPath: out, cleanup: () => rmJobDir(jobId) };
      },
      externalRef: (output, refPath) => {
        const p = probe(output);
        ff([
          '-i',
          f.big1080,
          '-vf',
          `scale=${p.width}:${p.height},fps=30`,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-qp',
          '0',
          '-an',
          refPath,
        ]);
      },
    },
  ];
}

// ---------------------------------------------------------------- metrics

interface Probe {
  width: number;
  height: number;
  duration: number;
  frames: number;
  sizeBytes: number;
  videoKbps: number;
}

function probe(path: string): Probe {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-count_packets',
      '-show_entries',
      'stream=width,height,nb_read_packets,bit_rate:format=duration',
      '-of',
      'json',
      path,
    ],
    { encoding: 'utf8' },
  );
  const j = JSON.parse(out) as {
    streams: { width: number; height: number; nb_read_packets: string; bit_rate?: string }[];
    format: { duration: string };
  };
  const s = j.streams[0];
  return {
    width: s.width,
    height: s.height,
    duration: Number(j.format.duration),
    frames: Number(s.nb_read_packets),
    sizeBytes: statSync(path).size,
    videoKbps: Math.round(Number(s.bit_rate ?? 0) / 1000),
  };
}

function ssimPsnr(dist: string, ref: string): { ssim: number; psnr: number } {
  const log = ffStats([
    '-i',
    dist,
    '-i',
    ref,
    '-lavfi',
    '[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim;[0:v]setpts=PTS-STARTPTS[c];[1:v]setpts=PTS-STARTPTS[d];[c][d]psnr',
    '-f',
    'null',
    '-',
  ]);
  const ssim = Number(/SSIM .*All:([\d.]+)/.exec(log)?.[1] ?? Number.NaN);
  const psnrRaw = /PSNR .*average:([\d.]+|inf)/.exec(log)?.[1] ?? 'NaN';
  return { ssim, psnr: psnrRaw === 'inf' ? Number.POSITIVE_INFINITY : Number(psnrRaw) };
}

/** Distinct frames in a (lossless) clip: exact duplicates are dropped. */
function uniqueFrames(path: string): number {
  const log = ffStats([
    '-i',
    path,
    '-vf',
    'mpdecimate=hi=1:lo=1:frac=0:max=0,showinfo',
    '-an',
    '-f',
    'null',
    '-',
  ]);
  return (log.match(/\bn:\s*\d+\s+pts:/g) ?? []).length;
}

// ---------------------------------------------------------------- shim

/**
 * ffmpeg wrapper for the lossless reference: drop pass 1 and replace rate
 * control on libx264 encodes with `-qp 0`. Filtergraphs are untouched.
 */
function installLosslessShim(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const real = execFileSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).trim();
  const shim = join(dir, 'ffmpeg');
  writeFileSync(
    shim,
    `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const a = process.argv.slice(2);
const isX264 = a.some((v, i) => v === '-c:v' && a[i + 1] === 'libx264');
const pass = a[a.indexOf('-pass') + 1];
if (isX264 && a.includes('-pass') && pass === '1') process.exit(0);
const drop = new Set(['-b:v', '-maxrate', '-bufsize', '-pass', '-passlogfile', '-preset', '-crf', '-x264-params', '-tune']);
const out = [];
for (let i = 0; i < a.length; i++) {
  if (isX264 && drop.has(a[i])) { i++; continue; }
  out.push(a[i]);
}
if (isX264) {
  const at = out.indexOf('libx264') + 1;
  out.splice(at, 0, '-preset', 'ultrafast', '-qp', '0');
}
const r = spawnSync(${JSON.stringify(real)}, out, { stdio: 'inherit' });
process.exit(r.status ?? 1);
`,
  );
  chmodSync(shim, 0o755);
  return dir;
}

// ---------------------------------------------------------------- main

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

interface CaseResult {
  name: string;
  runsMs: number[];
  medianMs: number;
  detailMedian?: Record<string, number>;
  output: Probe;
  quality?: { ssim: number; psnr: number; uniqueFrames: number; refFrames: number };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = join(args.outDir, args.label);
  mkdirSync(outDir, { recursive: true });
  // Silence per-job info logs so the table is readable.
  console.info = () => undefined;
  console.debug = () => undefined;

  const fx = buildFixtures(join(args.outDir, 'fixtures'));
  const all = cases(fx).filter((c) => !args.only || args.only.has(c.name));
  const results: CaseResult[] = [];

  // Warm caches (font CSS memo, Chromium binary lookup, page cache).
  console.error('warmup…');
  {
    const w = await all[0].run();
    w.cleanup();
  }

  for (const c of all) {
    const runsMs: number[] = [];
    const details: Record<string, number>[] = [];
    let last: CaseRun | undefined;
    for (let i = 0; i < args.runs; i++) {
      last?.cleanup();
      const t0 = performance.now();
      last = await c.run();
      runsMs.push(Math.round(performance.now() - t0));
      if (last.detail) details.push(last.detail);
    }
    if (!last) throw new Error('no runs');
    const kept = join(outDir, `${c.name}.mp4`);
    execFileSync('cp', [last.outputPath, kept]);
    last.cleanup();

    const detailMedian = details.length
      ? Object.fromEntries(
          Object.keys(details[0]).map((k) => [k, median(details.map((d) => d[k] ?? 0))]),
        )
      : undefined;
    const result: CaseResult = {
      name: c.name,
      runsMs,
      medianMs: median(runsMs),
      detailMedian,
      output: probe(kept),
    };
    console.error(`${c.name}: ${result.medianMs}ms  runs=${runsMs.join(',')}`);
    results.push(result);
  }

  if (args.quality) {
    const shimDir = installLosslessShim(join(outDir, 'shim'));
    const savedPath = process.env.PATH;
    for (const c of all) {
      const result = results.find((r) => r.name === c.name);
      if (!result) continue;
      const kept = join(outDir, `${c.name}.mp4`);
      const refPath = join(outDir, `${c.name}.ref.mkv`);
      rmSync(refPath, { force: true });
      if (c.externalRef) {
        c.externalRef(kept, refPath);
      } else {
        process.env.PATH = `${shimDir}:${savedPath}`;
        try {
          const r = await c.run();
          execFileSync('cp', [r.outputPath, refPath]);
          r.cleanup();
        } finally {
          process.env.PATH = savedPath;
        }
      }
      const q = ssimPsnr(kept, refPath);
      result.quality = {
        ...q,
        uniqueFrames: uniqueFrames(refPath),
        refFrames: probe(refPath).frames,
      };
      console.error(
        `${c.name}: ssim=${q.ssim.toFixed(5)} psnr=${q.psnr.toFixed(2)} unique=${result.quality.uniqueFrames}/${result.quality.refFrames}`,
      );
    }
  }

  const summary = { label: args.label, at: new Date().toISOString(), runs: args.runs, results };
  writeFileSync(join(outDir, 'results.json'), JSON.stringify(summary, null, 2));

  const rows = results.map((r) => ({
    case: r.name,
    'median ms': r.medianMs,
    'size MB': (r.output.sizeBytes / 1024 / 1024).toFixed(2),
    kbps: r.output.videoKbps,
    dims: `${r.output.width}x${r.output.height}`,
    frames: r.output.frames,
    ...(r.quality
      ? {
          ssim: r.quality.ssim.toFixed(5),
          psnr: r.quality.psnr.toFixed(2),
          unique: `${r.quality.uniqueFrames}/${r.quality.refFrames}`,
        }
      : {}),
  }));
  console.table(rows);
  console.error(`wrote ${join(outDir, 'results.json')}`);
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});

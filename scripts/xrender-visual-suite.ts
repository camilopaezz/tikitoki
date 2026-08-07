/**
 * Visual smoke suite for /xrender.
 *
 * Renders each status URL and writes only the first composed frame into a
 * folder for side-by-side review (no video/chrome copies required).
 *
 * Usage:
 *   pnpm xrender:frames
 *   pnpm exec tsx --env-file=.env scripts/xrender-visual-suite.ts
 *   pnpm exec tsx --env-file=.env scripts/xrender-visual-suite.ts --out ~/Downloads/xrender-frames
 *   pnpm exec tsx --env-file=.env scripts/xrender-visual-suite.ts https://x.com/i/status/123
 *
 * Extra URLs on the CLI are appended to the default suite.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { parseTwitterStatusId } from '../src/fetch/parseTwitterStatusId.js';
import { createPipeline } from '../src/pipeline.js';
import { runProcess } from '../src/process/run.js';
import { rmJobDir } from '../src/util/tmp.js';

/** Default cases — edit this list to grow the visual suite. */
const DEFAULT_URLS = [
  'https://x.com/i/status/2084813099152904590',
  'https://x.com/i/status/2084517746251841592',
  'https://x.com/i/status/2085109790166950362',
];

interface CaseResult {
  url: string;
  statusId: string;
  ok: boolean;
  framePath?: string;
  layout?: string;
  error?: string;
  ms: number;
}

function parseArgs(argv: string[]): { outDir: string; urls: string[] } {
  let outDir = join(homedir(), 'Downloads', 'xrender-frames');
  const urls: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') {
      const next = argv[++i];
      if (!next) throw new Error(`${a} requires a path`);
      outDir = next.replace(/^~(?=\/|$)/, homedir());
      continue;
    }
    if (a.startsWith('http://') || a.startsWith('https://')) {
      urls.push(a);
      continue;
    }
    throw new Error(`Unknown arg: ${a}`);
  }

  return { outDir, urls: urls.length ? [...DEFAULT_URLS, ...urls] : DEFAULT_URLS };
}

async function renderFrame(
  pipeline: ReturnType<typeof createPipeline>,
  url: string,
  outDir: string,
): Promise<CaseResult> {
  const statusId = parseTwitterStatusId(url);
  if (!statusId) {
    return { url, statusId: 'unknown', ok: false, error: 'not a Twitter/X status URL', ms: 0 };
  }

  const jobId = randomUUID();
  const started = Date.now();
  console.log(`\n→ ${statusId}`);
  console.log(`  ${url}`);

  try {
    const result = await pipeline({ jobId, userId: 0, url, mode: 'xrender' }, async (stage) => {
      console.log(`  stage ${stage}`);
    });

    const framePath = join(outDir, `${statusId}-frame.jpg`);
    await runProcess('ffmpeg', [
      '-y',
      '-i',
      result.outputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      framePath,
    ]);

    // Probe composed size for the summary (cheap)
    let layout: string | undefined;
    try {
      const probe = await runProcess('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0',
        framePath,
      ]);
      layout = probe.stdout.trim().replace(',', 'x');
    } catch {
      // optional
    }

    const ms = Date.now() - started;
    console.log(`  frame ${framePath}${layout ? ` (${layout})` : ''} ${ms}ms`);
    return { url, statusId, ok: true, framePath, layout, ms };
  } catch (err) {
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${message}`);
    return { url, statusId, ok: false, error: message, ms };
  } finally {
    rmJobDir(jobId);
  }
}

async function main() {
  const { outDir, urls } = parseArgs(process.argv.slice(2));
  // De-dupe while preserving order
  const seen = new Set<string>();
  const unique = urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  await mkdir(outDir, { recursive: true });
  console.log(`xrender visual suite → ${outDir}`);
  console.log(`${unique.length} case(s)`);

  const config = loadConfig();
  const pipeline = createPipeline({ config });
  const results: CaseResult[] = [];

  for (const url of unique) {
    results.push(await renderFrame(pipeline, url, outDir));
  }

  const summaryPath = join(outDir, 'summary.json');
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        outDir,
        results,
      },
      null,
      2,
    ),
    'utf8',
  );

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\nDone: ${ok} ok, ${fail} failed`);
  console.log(`Frames: ${outDir}`);
  console.log(`Summary: ${summaryPath}`);
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗';
    console.log(
      `  ${mark} ${r.statusId}${r.layout ? ` ${r.layout}` : ''}${r.error ? ` — ${r.error}` : ''}`,
    );
  }

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});

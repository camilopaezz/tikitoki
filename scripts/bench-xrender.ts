/**
 * Timed xrender benchmark for one (or more) X status URLs.
 *
 * Usage:
 *   pnpm xrender:bench -- https://x.com/Gilmoreniano/status/2091577686313341215
 *   pnpm exec tsx --env-file=.env scripts/bench-xrender.ts \
 *     --label post https://x.com/i/status/123
 *
 * Writes JSON summary to stdout and copies the MP4 + first frame under --out
 * (default: ./bench-out).
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../src/config/index.js';
import { parseTwitterStatusId } from '../src/fetch/parseTwitterStatusId.js';
import { createPipeline } from '../src/pipeline.js';
import { runProcess } from '../src/process/run.js';
import { rmJobDir } from '../src/util/tmp.js';

function parseArgs(argv: string[]): { outDir: string; label: string; urls: string[] } {
  let outDir = join(process.cwd(), 'bench-out');
  let label = 'run';
  const urls: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '-o') {
      const next = argv[++i];
      if (!next) throw new Error(`${a} requires a path`);
      outDir = next;
      continue;
    }
    if (a === '--label' || a === '-l') {
      const next = argv[++i];
      if (!next) throw new Error(`${a} requires a value`);
      label = next;
      continue;
    }
    if (a.startsWith('http://') || a.startsWith('https://')) {
      urls.push(a);
      continue;
    }
    throw new Error(`Unknown arg: ${a}`);
  }

  if (!urls.length) {
    throw new Error('Pass at least one https://x.com/.../status/... URL');
  }
  return { outDir, label, urls };
}

async function benchOne(
  pipeline: ReturnType<typeof createPipeline>,
  url: string,
  outDir: string,
  label: string,
) {
  const statusId = parseTwitterStatusId(url) ?? 'unknown';
  const jobId = randomUUID();
  const started = Date.now();
  const stageMarks: { stage: string; atMs: number }[] = [];

  console.error(`\n=== ${label} ${statusId} ===`);
  console.error(url);

  try {
    const result = await pipeline({ jobId, userId: 0, url, mode: 'xrender' }, async (stage) => {
      const atMs = Date.now() - started;
      stageMarks.push({ stage, atMs });
      console.error(`  stage ${stage} @ ${atMs}ms`);
    });

    await mkdir(outDir, { recursive: true });
    const prefix = join(outDir, `${label}-${statusId}`);
    const mp4Dest = `${prefix}.mp4`;
    const frameDest = `${prefix}-frame.jpg`;
    await copyFile(result.outputPath, mp4Dest);

    await runProcess('ffmpeg', [
      '-y',
      '-i',
      result.outputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      frameDest,
    ]);

    let probe: { width?: number; height?: number; duration?: number; size?: number } = {};
    try {
      const p = await runProcess('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration,size',
        '-of',
        'json',
        mp4Dest,
      ]);
      const j = JSON.parse(p.stdout) as {
        streams?: { width?: number; height?: number }[];
        format?: { duration?: string; size?: string };
      };
      probe = {
        width: j.streams?.[0]?.width,
        height: j.streams?.[0]?.height,
        duration: j.format?.duration ? Number(j.format.duration) : undefined,
        size: j.format?.size ? Number(j.format.size) : undefined,
      };
    } catch {
      // optional
    }

    const totalMs = Date.now() - started;
    const summary = {
      label,
      url,
      statusId,
      ok: true as const,
      totalMs,
      stageMarks,
      output: { mp4: mp4Dest, frame: frameDest, ...probe },
      jobId,
    };
    await writeFile(`${prefix}-summary.json`, JSON.stringify(summary, null, 2));
    console.error(`  done ${totalMs}ms → ${mp4Dest}`);
    console.log(JSON.stringify(summary));
    return summary;
  } catch (err) {
    const totalMs = Date.now() - started;
    const summary = {
      label,
      url,
      statusId,
      ok: false as const,
      totalMs,
      stageMarks,
      error: (err as Error).message,
      jobId,
    };
    console.error(`  FAILED ${totalMs}ms`, err);
    console.log(JSON.stringify(summary));
    return summary;
  } finally {
    rmJobDir(jobId);
  }
}

async function main() {
  const { outDir, label, urls } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const pipeline = createPipeline({ config });
  await mkdir(outDir, { recursive: true });

  const results = [];
  for (const url of urls) {
    results.push(await benchOne(pipeline, url, outDir, label));
  }

  const rollup = {
    label,
    at: new Date().toISOString(),
    results,
  };
  await writeFile(join(outDir, `${label}-rollup.json`), JSON.stringify(rollup, null, 2));
  console.error(`\nWrote ${join(outDir, `${label}-rollup.json`)}`);
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});

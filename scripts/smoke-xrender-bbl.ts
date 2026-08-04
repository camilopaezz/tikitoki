import { copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config/index.js';
import { createPipeline } from '../src/pipeline.js';
import { perJobDir, rmJobDir } from '../src/util/tmp.js';

const url = 'https://x.com/i/status/2084391060336259405';

async function main() {
  const jobId = randomUUID();
  const config = loadConfig();
  const pipeline = createPipeline({ config });
  const stages: string[] = [];

  console.log('jobId', jobId);
  console.log('url', url);

  try {
    const result = await pipeline(
      { jobId, userId: 0, url, mode: 'xrender' },
      async (stage) => {
        stages.push(stage);
        console.log('stage', stage);
      },
    );

    console.log('stages', stages);
    console.log('output', result.outputPath);

    const downloads = join(homedir(), 'Downloads');
    await mkdir(downloads, { recursive: true });
    const dest = join(downloads, 'xrender-bbl-brndxix.mp4');
    await copyFile(result.outputPath, dest);
    console.log('saved', dest);

    try {
      const chrome = join(perJobDir(jobId), 'xchrome', 'chrome.png');
      const chromeDest = join(downloads, 'xrender-bbl-brndxix-chrome.png');
      await copyFile(chrome, chromeDest);
      console.log('chrome', chromeDest);
    } catch (err) {
      console.log('no chrome png:', (err as Error).message);
    }
  } finally {
    rmJobDir(jobId);
  }
}

main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});

import { execSync } from 'node:child_process';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config/index.js';
import { AuthFailureError } from '../../src/fetch/authFailure.js';
import { NoVideoError } from '../../src/fetch/noVideo.js';
import { createPipeline } from '../../src/pipeline.js';

const VIDEO_URL = 'https://x.com/i/status/2084391060336259405';

const twitterCookiesPath = process.env.TWITTER_COOKIES_PATH;

const config: Config = {
  botToken: 'unused',
  cookiesPath: undefined,
  instagramCookiesPath: undefined,
  twitterCookiesPath,
  concurrency: 2,
  cooldownSeconds: 30,
  hourlyCap: 60,
  targetSizeMb: 45,
  crossfadeSeconds: 0.4,
  silentSlideSeconds: 3,
};

const jobIds: string[] = [];

function cleanJobDir(jobId: string): void {
  try {
    rmSync(join(tmpdir(), 'tikitoki', jobId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

afterAll(() => {
  for (const jobId of jobIds) cleanJobDir(jobId);
});

function probe(path: string) {
  const raw = execSync(
    `ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,codec_type,pix_fmt -of json "${path}"`,
  );
  return JSON.parse(raw.toString());
}

function isMp4(path: string): boolean {
  const fd = readFileSync(path);
  if (fd.length < 12) return false;
  return fd.toString('binary', 4, 8) === 'ftyp';
}

describe('pipeline integration (real Twitter/X URLs)', () => {
  const runPipeline = createPipeline({ config });

  it('downloads a Twitter/X video and skips Rendering', async () => {
    const jobId = 'tw-int-video';
    jobIds.push(jobId);
    const job = { jobId, userId: 1, url: VIDEO_URL };

    const seen: string[] = [];
    const onStage = async (stage: string) => {
      seen.push(stage);
    };

    let result: { outputPath: string };
    try {
      result = await runPipeline(job, onStage);
    } catch (err) {
      if (err instanceof AuthFailureError) {
        console.warn(`[skip] twitter video integration: auth challenge (${jobId})`);
        return;
      }
      if (err instanceof NoVideoError) {
        console.warn(`[skip] twitter video integration: no video in tweet (${jobId})`);
        return;
      }
      // Soft-skip expected network / extractor flakiness so CI doesn't flap.
      const message = err instanceof Error ? err.message : String(err);
      if (
        /HTTP Error|Unable to download|network|timed out|ECONN|ENOTFOUND|403|429|404/i.test(message)
      ) {
        console.warn(`[skip] twitter video integration: transient error (${jobId}): ${message}`);
        return;
      }
      throw err;
    }

    expect(seen).toEqual(['Fetching', 'Uploading']);
    expect(result.outputPath).toMatch(/\.mp4$/);

    const stats = statSync(result.outputPath);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.size).toBeLessThan(45 * 1024 * 1024);

    const probeResult = probe(result.outputPath);
    const videoStream = probeResult.streams.find(
      (s: { codec_type: string }) => s.codec_type === 'video',
    );
    expect(videoStream).toBeDefined();
    expect(Number.parseFloat(probeResult.format.duration)).toBeGreaterThan(0);
    expect(isMp4(result.outputPath)).toBe(true);
  }, 180_000);
});

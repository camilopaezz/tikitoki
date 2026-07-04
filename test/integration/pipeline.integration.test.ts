import { execSync } from 'node:child_process';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config/index.js';
import { AuthFailureError } from '../../src/fetch/authFailure.js';
import { createPipeline } from '../../src/pipeline.js';

const SLIDESHOW_URL = 'https://vt.tiktok.com/ZSCVNuK44/';
const VIDEO_URL = 'https://vt.tiktok.com/ZSx57aSxC/';

const config: Config = {
  botToken: 'unused',
  cookiesPath: undefined,
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
  // ftyp box marks an ISO BMFF / MP4 file.
  const fd = readFileSync(path);
  if (fd.length < 12) return false;
  return fd.toString('binary', 4, 8) === 'ftyp';
}

describe('pipeline integration (real TikTok URLs)', () => {
  const runPipeline = createPipeline({ config });

  it('downloads and renders a slideshow to a valid MP4', async () => {
    const jobId = 'pipe-int-slideshow';
    jobIds.push(jobId);
    const job = { jobId, userId: 1, url: SLIDESHOW_URL };

    const seen: string[] = [];
    const onStage = async (stage: string) => {
      seen.push(stage);
    };

    let result: { outputPath: string };
    try {
      result = await runPipeline(job, onStage);
    } catch (err) {
      if (err instanceof AuthFailureError) {
        console.warn(`[skip] slideshow integration: TikTok auth challenge (${jobId})`);
        return;
      }
      throw err;
    }

    expect(seen).toEqual(['Fetching', 'Rendering', 'Uploading']);
    expect(result.outputPath).toMatch(/\.mp4$/);

    const stats = statSync(result.outputPath);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.size).toBeLessThan(45 * 1024 * 1024);

    const probeResult = probe(result.outputPath);
    const videoStream = probeResult.streams.find(
      (s: { codec_type: string }) => s.codec_type === 'video',
    );
    expect(videoStream).toBeDefined();
    expect(videoStream.pix_fmt).toContain('yuv420p');
    expect(Number.parseFloat(probeResult.format.duration)).toBeGreaterThan(0);
    expect(isMp4(result.outputPath)).toBe(true);
  }, 180_000);

  it('downloads a video post and skips Rendering', async () => {
    const jobId = 'pipe-int-video';
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
        console.warn(`[skip] video integration: TikTok auth challenge (${jobId})`);
        return;
      }
      throw err;
    }

    expect(seen).toEqual(['Fetching', 'Uploading']);
    expect(result.outputPath).toMatch(/\.mp4$/);

    const stats = statSync(result.outputPath);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.size).toBeLessThan(45 * 1024 * 1024);

    // Video posts are passed through untouched (no transcode), so we only
    // assert a valid MP4 with a video stream of any codec and real duration.
    const probeResult = probe(result.outputPath);
    const videoStream = probeResult.streams.find(
      (s: { codec_type: string }) => s.codec_type === 'video',
    );
    expect(videoStream).toBeDefined();
    expect(Number.parseFloat(probeResult.format.duration)).toBeGreaterThan(0);
    expect(isMp4(result.outputPath)).toBe(true);
  }, 180_000);
});

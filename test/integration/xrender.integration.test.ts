import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { XPostAssets } from '../../src/fetch/downloadXAssets.js';
import { closeSharedBrowser } from '../../src/render/x/chromiumBrowser.js';
import { renderXPost } from '../../src/render/x/renderXPost.js';

/** Offline X feed-card render: real Chromium + ffmpeg, synthetic media. */

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
}

function probe(path: string) {
  return JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-count_frames',
        '-show_entries',
        'stream=codec_type,width,height,nb_read_frames:format=duration',
        '-of',
        'json',
        path,
      ],
      { encoding: 'utf8' },
    ),
  ) as {
    streams: { codec_type: string; width?: number; height?: number; nb_read_frames?: string }[];
    format: { duration: string };
  };
}

/** Frames left after dropping exact repeats (on a lossless decode of the media area). */
function distinctFrames(path: string): number {
  const log = execFileSync(
    'sh',
    [
      '-c',
      'ffmpeg -nostats -i "$1" -vf mpdecimate=hi=64:lo=64:frac=0:max=0,showinfo -an -f null - 2>&1',
      'sh',
      path,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return (log.match(/\bn:\s*\d+\s+pts:/g) ?? []).length;
}

describe('renderXPost integration', () => {
  afterAll(async () => {
    await closeSharedBrowser();
  });

  it('composites every source frame at 30 fps with audio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tikitoki-xrender-int-'));
    const video = join(dir, 'v.mp4');
    const avatar = join(dir, 'avatar.png');
    // Every frame differs (moving test pattern + frame counter).
    ff([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=1280x720:r=30:d=3',
      '-f',
      'lavfi',
      '-i',
      'sine=d=3',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      video,
    ]);
    ff(['-f', 'lavfi', '-i', 'testsrc=s=200x200', '-frames:v', '1', avatar]);

    const assets: XPostAssets = {
      layoutKind: 'simple_video',
      statusId: '1',
      sourceUrl: 'https://x.com/i/status/1',
      outer: {
        author: { name: 'Integration', handle: 'int', avatarPath: avatar, verified: true },
        text: { text: 'A caption that wraps.', displayText: 'A caption that wraps.' },
      },
      primaryVideo: { path: video, width: 1280, height: 720, durationSec: 3 },
    };

    const { outputPath } = await renderXPost({ jobId: 'xrender-int', assets, jobDir: dir });
    const p = probe(outputPath);
    const v = p.streams.find((s) => s.codec_type === 'video');
    expect(v?.width).toBe(720);
    expect((v?.height ?? 0) % 2).toBe(0);
    expect(p.streams.some((s) => s.codec_type === 'audio')).toBe(true);
    expect(Number(p.format.duration)).toBeCloseTo(3, 0);
    expect(Number(v?.nb_read_frames)).toBe(90);
    // A 25 fps base would leave ~75 distinct frames padded with duplicates.
    expect(distinctFrames(outputPath)).toBeGreaterThanOrEqual(88);
  }, 120_000);
});

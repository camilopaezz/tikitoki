import { describe, expect, it, vi } from 'vitest';
import type { XPostAssets } from '../../../../src/fetch/downloadXAssets.js';
import { renderXPost } from '../../../../src/render/x/renderXPost.js';

const assets: XPostAssets = {
  layoutKind: 'simple_video',
  statusId: '1',
  sourceUrl: 'https://x.com/u/status/1',
  outer: {
    author: { name: 'A', handle: 'a', verified: false },
    text: { text: 'hi', displayText: 'hi' },
  },
  primaryVideo: { path: '/tmp/v.mp4', width: 1280, height: 720, durationSec: 8 },
};

function lastArgs(runFfmpegFn: ReturnType<typeof vi.fn>): string[] {
  const calls = runFfmpegFn.mock.calls;
  return calls[calls.length - 1][0] as string[];
}

describe('renderXPost', () => {
  it('screenshots, measures hole, then single-pass ffmpeg when max bitrate binds', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const measureFn = vi.fn().mockResolvedValue({
      x: 118,
      y: 120,
      contentHeight: 900,
      greenW: 498,
      greenH: 280,
    });
    const runFfmpegFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    const result = await renderXPost({
      jobId: 'jx',
      assets,
      jobDir: '/tmp/job',
      targetSizeMb: 45,
      screenshotFn,
      measureFn,
      runFfmpegFn,
    });

    expect(result.outputPath).toBe('/tmp/job/xrender.mp4');
    expect(result.timings).toBeDefined();
    expect(result.timings.encode).toBeTypeOf('number');
    expect(screenshotFn).toHaveBeenCalledOnce();
    expect(screenshotFn).toHaveBeenCalledWith(expect.objectContaining({ width: 720, jobId: 'jx' }));
    expect(measureFn).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.png', { jobId: 'jx' });
    // Short clip → max bitrate binds → single pass
    expect(runFfmpegFn).toHaveBeenCalledTimes(1);

    const args = lastArgs(runFfmpegFn);
    expect(args).toContain('/tmp/v.mp4');
    expect(args).toContain('/tmp/job/xchrome/chrome.png');
    expect(args).toContain('veryfast');
    expect(args).not.toContain('-pass');
    expect(args).toContain('-maxrate');
    expect(args).toContain('-bufsize');
    expect(args).toContain('0:a?');
    expect(args).toContain('aac');
    // Chrome is one still frame (looped in-graph), not a -loop 1 input.
    expect(args).not.toContain('-loop');
    // Video is placed at the measured media position, not the placeholder.
    expect(args.join(' ')).toContain('pad=720:900:118:120:black');
    expect(args.join(' ')).toContain('crop=720:900:0:0');
    expect(args.join(' ')).toContain('filter_complex');
    const bIdx = args.indexOf('-b:v');
    expect(bIdx).toBeGreaterThan(-1);
    expect(Number(args[bIdx + 1])).toBe(4_000_000);
  });

  it('uses two-pass encode when the size budget binds (long clip)', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const measureFn = vi.fn().mockResolvedValue({
      x: 118,
      y: 120,
      contentHeight: 900,
      greenW: 498,
      greenH: 280,
    });
    const runFfmpegFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    // 45 MB / 180s ≈ 2 Mbps → under 4 Mbps cap → size budget binds
    await renderXPost({
      jobId: 'jx-long',
      assets: {
        ...assets,
        primaryVideo: { ...assets.primaryVideo, durationSec: 180 },
      },
      jobDir: '/tmp/job',
      targetSizeMb: 45,
      screenshotFn,
      measureFn,
      runFfmpegFn,
    });

    expect(runFfmpegFn).toHaveBeenCalledTimes(2);
    const pass1 = runFfmpegFn.mock.calls[0][0] as string[];
    const pass2 = runFfmpegFn.mock.calls[1][0] as string[];
    expect(pass1).toContain('-pass');
    expect(pass1).toContain('1');
    expect(pass1).toContain('veryfast');
    expect(pass2).toContain('2');
    expect(pass2).toContain('0:a?');
    expect(pass2).toContain('aac');
    const bIdx = pass2.indexOf('-b:v');
    expect(Number(pass2[bIdx + 1])).toBeLessThan(4_000_000);
  });

  it('scales the encode canvas when measured chrome is taller than 1280', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const measureFn = vi.fn().mockResolvedValue({
      x: 118,
      y: 120,
      contentHeight: 1336,
      greenW: 498,
      greenH: 280,
    });
    const runFfmpegFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    await renderXPost({
      jobId: 'jx-tall',
      assets,
      jobDir: '/tmp/job',
      targetSizeMb: 45,
      screenshotFn,
      measureFn,
      runFfmpegFn,
    });

    const args = lastArgs(runFfmpegFn).join(' ');
    // Crop the full measured card, then scale it to the 1280-tall encode canvas.
    expect(args).toMatch(/crop=720:1336:0:0,format=rgba,scale=\d+:1280,/);
    expect(args).toMatch(/pad=\d+:1280:/);
  });
});

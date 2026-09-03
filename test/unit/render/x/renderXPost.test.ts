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
  it('screenshots, measures hole, crops, then single-pass ffmpeg when max bitrate binds', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const measureFn = vi.fn().mockResolvedValue({
      x: 176,
      y: 120,
      contentHeight: 900,
      greenW: 498,
      greenH: 280,
    });
    const cropFn = vi.fn().mockResolvedValue(undefined);
    const runFfmpegFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    const result = await renderXPost({
      jobId: 'jx',
      assets,
      jobDir: '/tmp/job',
      targetSizeMb: 45,
      screenshotFn,
      measureFn,
      cropFn,
      runFfmpegFn,
    });

    expect(result.outputPath).toBe('/tmp/job/xrender.mp4');
    expect(result.timings).toBeDefined();
    expect(result.timings.encode).toBeTypeOf('number');
    expect(screenshotFn).toHaveBeenCalledOnce();
    expect(screenshotFn).toHaveBeenCalledWith(expect.objectContaining({ width: 720, jobId: 'jx' }));
    expect(measureFn).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.png', { jobId: 'jx' });
    expect(cropFn).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.png', 720, 900, { jobId: 'jx' });
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
    // Overlay uses measured media Y, not the placeholder estimate.
    expect(args.join(' ')).toContain('overlay=176:120');
    expect(args.join(' ')).toContain('filter_complex');
    const bIdx = args.indexOf('-b:v');
    expect(bIdx).toBeGreaterThan(-1);
    expect(Number(args[bIdx + 1])).toBe(4_000_000);
  });

  it('uses two-pass encode when the size budget binds (long clip)', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const measureFn = vi.fn().mockResolvedValue({
      x: 176,
      y: 120,
      contentHeight: 900,
      greenW: 498,
      greenH: 280,
    });
    const cropFn = vi.fn().mockResolvedValue(undefined);
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
      cropFn,
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
});

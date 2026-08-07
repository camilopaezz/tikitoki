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

describe('renderXPost', () => {
  it('screenshots, measures hole, crops, then two-pass ffmpeg', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const measureFn = vi.fn().mockResolvedValue({
      x: 44,
      y: 120,
      contentHeight: 900,
      greenW: 992,
      greenH: 558,
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
    expect(screenshotFn).toHaveBeenCalledOnce();
    expect(measureFn).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.png', { jobId: 'jx' });
    expect(cropFn).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.png', 1080, 900, { jobId: 'jx' });
    expect(runFfmpegFn).toHaveBeenCalledTimes(2);

    const pass1 = runFfmpegFn.mock.calls[0][0] as string[];
    const pass2 = runFfmpegFn.mock.calls[1][0] as string[];
    expect(pass1).toContain('-pass');
    expect(pass1).toContain('1');
    expect(pass2).toContain('2');
    expect(pass2).toContain('/tmp/v.mp4');
    expect(pass2).toContain('/tmp/job/xchrome/chrome.png');
    // Overlay uses measured media Y, not the placeholder estimate.
    expect(pass2.join(' ')).toContain('overlay=44:120');
    expect(pass2.join(' ')).toContain('filter_complex');
  });
});

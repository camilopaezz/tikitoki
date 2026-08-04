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
  it('screenshots chrome and runs two-pass ffmpeg', async () => {
    const screenshotFn = vi.fn().mockResolvedValue('/tmp/job/xchrome/chrome.png');
    const runFfmpegFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });

    const result = await renderXPost({
      jobId: 'jx',
      assets,
      jobDir: '/tmp/job',
      targetSizeMb: 45,
      screenshotFn,
      runFfmpegFn,
    });

    expect(result.outputPath).toBe('/tmp/job/xrender.mp4');
    expect(screenshotFn).toHaveBeenCalledOnce();
    expect(runFfmpegFn).toHaveBeenCalledTimes(2);

    const pass1 = runFfmpegFn.mock.calls[0][0] as string[];
    const pass2 = runFfmpegFn.mock.calls[1][0] as string[];
    expect(pass1).toContain('-pass');
    expect(pass1).toContain('1');
    expect(pass2).toContain('2');
    expect(pass2).toContain('/tmp/v.mp4');
    expect(pass2).toContain('/tmp/job/xchrome/chrome.png');
    expect(pass2.join(' ')).toContain('filter_complex');
  });
});

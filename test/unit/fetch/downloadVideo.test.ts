import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runYtDlp = vi.fn();
const statSync = vi.fn();
const runFfmpeg = vi.fn();

vi.mock('../../../src/process/ffmpeg.js', () => ({
  runFfmpeg: (...args: unknown[]) => runFfmpeg(...args),
}));

vi.mock('../../../src/render/probe.js', () => ({
  probeVideo: vi.fn().mockResolvedValue({ width: 1920, height: 1080, durationSec: 600 }),
}));

vi.mock('../../../src/process/ytDlp.js', () => ({
  runYtDlp: (...args: unknown[]) => runYtDlp(...args),
}));

vi.mock('node:fs', () => ({
  statSync: (...args: unknown[]) => statSync(...args),
}));

import { AuthFailureError } from '../../../src/fetch/authFailure.js';
import { downloadVideo, OversizedVideoError } from '../../../src/fetch/downloadVideo.js';
import { NoVideoError } from '../../../src/fetch/noVideo.js';

describe('downloadVideo', () => {
  beforeEach(() => {
    runYtDlp.mockReset();
    statSync.mockReset();
    runFfmpeg.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once on HTTP 429 then succeeds', async () => {
    runYtDlp
      .mockRejectedValueOnce(
        new Error(
          'Process exited with code 1: ERROR: Unable to download webpage: HTTP Error 429: Too Many Requests',
        ),
      )
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

    const promise = downloadVideo({
      url: 'https://www.tiktok.com/@u/video/1',
      outDir: '/tmp/job',
      jobId: 'j1',
    });
    await vi.runAllTimersAsync();
    const path = await promise;

    expect(path).toBe('/tmp/job/out.mp4');
    expect(runYtDlp).toHaveBeenCalledTimes(2);
  });

  it('does not retry auth failures', async () => {
    runYtDlp.mockRejectedValue(new Error('ERROR: login required'));

    await expect(
      downloadVideo({
        url: 'https://www.tiktok.com/@u/video/1',
        outDir: '/tmp/job',
        platform: 'tiktok',
      }),
    ).rejects.toBeInstanceOf(AuthFailureError);

    expect(runYtDlp).toHaveBeenCalledTimes(1);
  });

  it('does not retry no-video errors', async () => {
    runYtDlp.mockRejectedValue(
      new Error('ERROR: [twitter] 123: No video could be found in this tweet'),
    );

    await expect(
      downloadVideo({
        url: 'https://x.com/i/status/123',
        outDir: '/tmp/job',
        platform: 'twitter',
      }),
    ).rejects.toBeInstanceOf(NoVideoError);

    expect(runYtDlp).toHaveBeenCalledTimes(1);
  });

  it('does not retry yt-dlp HTTP 404 (Unable to download webpage)', async () => {
    runYtDlp.mockRejectedValue(
      new Error(
        'Process exited with code 1: ERROR: Unable to download webpage: HTTP Error 404: Not Found',
      ),
    );

    await expect(
      downloadVideo({
        url: 'https://www.tiktok.com/@u/video/1',
        outDir: '/tmp/job',
      }),
    ).rejects.toThrow(/404/);

    expect(runYtDlp).toHaveBeenCalledTimes(1);
  });

  it('rethrows after a second transient failure', async () => {
    runYtDlp.mockRejectedValue(new Error('ERROR: HTTP Error 503: Service Unavailable'));

    const promise = downloadVideo({
      url: 'https://www.tiktok.com/@u/video/1',
      outDir: '/tmp/job',
    });
    // Attach rejection handler before advancing timers so the second failure is not unhandled.
    const assertion = expect(promise).rejects.toThrow(/503/);
    await vi.runAllTimersAsync();
    await assertion;

    expect(runYtDlp).toHaveBeenCalledTimes(2);
  });

  it('transcodes an oversized X video and returns the file that fits the upload limit', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    statSync
      .mockReturnValueOnce({ size: 164.7 * 1024 * 1024 })
      .mockReturnValue({ size: 44 * 1024 * 1024 });

    await expect(
      downloadVideo({
        url: 'https://x.com/i/status/123',
        outDir: '/tmp/job',
        maxSizeMb: 45,
      }),
    ).resolves.toBe('/tmp/job/out-compressed.mp4');

    expect(runYtDlp).toHaveBeenCalledTimes(1);
    expect(runFfmpeg).toHaveBeenCalledTimes(2);
  });

  it('preserves a video already at the size limit without encoding', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    statSync.mockReturnValue({ size: 45 * 1024 * 1024 });
    await expect(
      downloadVideo({
        url: 'https://x.com/i/status/123',
        outDir: '/tmp/job',
        maxSizeMb: 45,
      }),
    ).resolves.toBe('/tmp/job/out.mp4');
    expect(runFfmpeg).not.toHaveBeenCalled();
  });

  it('retries compression at a lower bitrate if the encoded output is still too large', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    statSync
      .mockReturnValueOnce({ size: 165 * 1024 * 1024 })
      .mockReturnValueOnce({ size: 46 * 1024 * 1024 })
      .mockReturnValueOnce({ size: 40 * 1024 * 1024 });
    await expect(
      downloadVideo({
        url: 'https://x.com/i/status/123',
        outDir: '/tmp/job',
        maxSizeMb: 45,
      }),
    ).resolves.toBe('/tmp/job/out-compressed.mp4');
    expect(runFfmpeg).toHaveBeenCalledTimes(4);
    const first = runFfmpeg.mock.calls[0][0] as string[];
    const retry = runFfmpeg.mock.calls[2][0] as string[];
    expect(Number(retry[retry.indexOf('-b:v') + 1])).toBeLessThan(
      Number(first[first.indexOf('-b:v') + 1]),
    );
  });

  it('rejects a video that still exceeds the limit after bounded compression attempts', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    statSync.mockReturnValue({ size: 165 * 1024 * 1024 });
    await expect(
      downloadVideo({
        url: 'https://x.com/i/status/123',
        outDir: '/tmp/job',
        maxSizeMb: 45,
      }),
    ).rejects.toBeInstanceOf(OversizedVideoError);
    expect(runFfmpeg).toHaveBeenCalledTimes(4);
    expect(runYtDlp).toHaveBeenCalledTimes(1);
  });

  it('propagates encoder failures without downloading again', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    statSync.mockReturnValue({ size: 165 * 1024 * 1024 });
    runFfmpeg.mockRejectedValue(new Error('Encoder failed'));
    await expect(
      downloadVideo({
        url: 'https://x.com/i/status/123',
        outDir: '/tmp/job',
        maxSizeMb: 45,
      }),
    ).rejects.toThrow('Encoder failed');
    expect(runYtDlp).toHaveBeenCalledTimes(1);
  });

  it('passes --referer for TikTok URLs', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await downloadVideo({
      url: 'https://www.tiktok.com/@u/video/1',
      outDir: '/tmp/job',
    });

    expect(runYtDlp).toHaveBeenCalledWith(
      [
        '-o',
        '/tmp/job/out.mp4',
        '--referer',
        'https://www.tiktok.com/',
        'https://www.tiktok.com/@u/video/1',
      ],
      expect.anything(),
    );
  });

  it('does not pass --referer for non-TikTok URLs', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await downloadVideo({
      url: 'https://www.instagram.com/reel/abc/',
      outDir: '/tmp/job',
      platform: 'instagram',
    });

    const args = runYtDlp.mock.calls[0][0] as string[];
    expect(args).not.toContain('--referer');
    expect(args).toEqual(['-o', '/tmp/job/out.mp4', 'https://www.instagram.com/reel/abc/']);
  });
});

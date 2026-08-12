import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runYtDlp = vi.fn();
const statSync = vi.fn();

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


  it('checks size after a successful download', async () => {
    runYtDlp.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    // 50 MB > 45 MB limit
    statSync.mockReturnValue({ size: 50 * 1024 * 1024 });

    await expect(
      downloadVideo({
        url: 'https://www.tiktok.com/@u/video/1',
        outDir: '/tmp/job',
        maxSizeMb: 45,
      }),
    ).rejects.toBeInstanceOf(OversizedVideoError);

    expect(runYtDlp).toHaveBeenCalledTimes(1);
  });
});

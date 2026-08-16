import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runYtDlp = vi.fn();

vi.mock('../../../src/process/ytDlp.js', () => ({
  runYtDlp: (...args: unknown[]) => runYtDlp(...args),
}));

import { dumpJson } from '../../../src/fetch/dumpJson.js';

describe('dumpJson', () => {
  beforeEach(() => {
    runYtDlp.mockReset();
    runYtDlp.mockResolvedValue({
      stdout: JSON.stringify({ id: '1', formats: [] }),
      stderr: '',
      exitCode: 0,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes --referer for TikTok URLs', async () => {
    await dumpJson({ url: 'https://www.tiktok.com/@u/video/1', jobId: 'j1' });

    expect(runYtDlp).toHaveBeenCalledWith(
      [
        '-j',
        '--no-download',
        '--referer',
        'https://www.tiktok.com/',
        'https://www.tiktok.com/@u/video/1',
      ],
      expect.anything(),
    );
  });

  it('does not pass --referer for non-TikTok URLs', async () => {
    await dumpJson({ url: 'https://www.instagram.com/reel/abc/' });

    const args = runYtDlp.mock.calls[0][0] as string[];
    expect(args).not.toContain('--referer');
    expect(args).toEqual(['-j', '--no-download', 'https://www.instagram.com/reel/abc/']);
  });
});

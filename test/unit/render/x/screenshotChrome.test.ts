import { beforeEach, describe, expect, it, vi } from 'vitest';

const runProcess = vi.fn();
const writeFile = vi.fn();
const rename = vi.fn();
const mkdir = vi.fn();
const access = vi.fn();

vi.mock('../../../../src/process/run.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/process/run.js')>();
  return {
    ...actual,
    runProcess: (...args: unknown[]) => runProcess(...args),
  };
});

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
  rename: (...args: unknown[]) => rename(...args),
  mkdir: (...args: unknown[]) => mkdir(...args),
  access: (...args: unknown[]) => access(...args),
}));

import { ProcessError, ProcessTimeoutError } from '../../../../src/process/run.js';
import {
  CHROME_PROCESS_TIMEOUT_MS,
  CHROME_TIMEOUT_MS,
  CHROME_VIRTUAL_TIME_MS,
  screenshotChrome,
} from '../../../../src/render/x/screenshotChrome.js';

const opts = {
  html: '<html></html>',
  jobDir: '/tmp/job',
  width: 1080,
  height: 800,
  jobId: 'j1',
  chromiumBin: 'chromium',
} as const;

describe('screenshotChrome', () => {
  beforeEach(() => {
    runProcess.mockReset().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    writeFile.mockReset().mockResolvedValue(undefined);
    rename.mockReset().mockResolvedValue(undefined);
    mkdir.mockReset().mockResolvedValue(undefined);
    access.mockReset().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
  });

  it('passes hang-prevention flags and a process timeout to Chromium', async () => {
    const png = await screenshotChrome(opts);

    expect(png).toBe('/tmp/job/xchrome/chrome.png');
    expect(mkdir).toHaveBeenCalledWith('/tmp/job/xchrome/user-data', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.html', '<html></html>', 'utf8');

    const chromeCall = runProcess.mock.calls.find((call) => call[0] === 'chromium');
    expect(chromeCall).toBeDefined();
    const args = chromeCall?.[1] as string[];
    const chromeOpts = chromeCall?.[2] as { timeoutMs: number; jobId: string };

    expect(args).toContain('--headless=new');
    expect(args).toContain('--disable-dev-shm-usage');
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--disable-background-networking');
    expect(args).toContain('--disable-component-update');
    expect(args).toContain('--disable-breakpad');
    expect(args).toContain('--disable-features=OnDeviceModel,OptimizationGuideOnDeviceModel');
    expect(args).toContain(`--virtual-time-budget=${CHROME_VIRTUAL_TIME_MS}`);
    expect(args).toContain(`--timeout=${CHROME_TIMEOUT_MS}`);
    expect(args).toContain('--user-data-dir=/tmp/job/xchrome/user-data');
    expect(args).toContain('--window-size=1080,800');
    expect(args).toContain('--screenshot=/tmp/job/xchrome/chrome.png');
    expect(args).toContain('file:///tmp/job/xchrome/chrome.html');
    expect(chromeOpts.timeoutMs).toBe(CHROME_PROCESS_TIMEOUT_MS);
    expect(chromeOpts.jobId).toBe('j1');

    const ffmpegCall = runProcess.mock.calls.find((call) => call[0] === 'ffmpeg');
    expect(ffmpegCall).toBeDefined();
    expect(ffmpegCall?.[2]?.timeoutMs).toBeUndefined();
  });

  it('maps a Chromium ProcessError without a PNG to ProcessTimeoutError', async () => {
    runProcess.mockImplementation(async (cmd: string) => {
      if (cmd === 'chromium') {
        throw new ProcessError(
          'Process exited with code 1: ',
          'chromium --timeout=15000',
          [],
          1,
          '',
        );
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await expect(screenshotChrome(opts)).rejects.toBeInstanceOf(ProcessTimeoutError);
    expect(runProcess.mock.calls.some((call) => call[0] === 'ffmpeg')).toBe(false);
  });

  it('continues to ffmpeg if Chromium exits non-zero but wrote the PNG', async () => {
    runProcess.mockImplementation(async (cmd: string) => {
      if (cmd === 'chromium') {
        throw new ProcessError('Process exited with code 1: ', 'chromium', [], 1, '');
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    access.mockResolvedValue(undefined);

    await expect(screenshotChrome(opts)).resolves.toBe('/tmp/job/xchrome/chrome.png');
    expect(runProcess.mock.calls.some((call) => call[0] === 'ffmpeg')).toBe(true);
  });
});

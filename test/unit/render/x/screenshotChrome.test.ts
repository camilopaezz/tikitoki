import { beforeEach, describe, expect, it, vi } from 'vitest';

const runProcess = vi.fn();
const writeFile = vi.fn();
const rename = vi.fn();
const mkdir = vi.fn();
const access = vi.fn();
const readFile = vi.fn();

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
  readFile: (...args: unknown[]) => readFile(...args),
}));

/** Just enough PNG for readPngSize: signature + IHDR width/height. */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8;
  b[25] = 2;
  return b;
}

import { ProcessError, ProcessTimeoutError } from '../../../../src/process/run.js';
import {
  CHROME_PROCESS_TIMEOUT_MS,
  CHROME_TIMEOUT_MS,
  CHROME_VIRTUAL_TIME_MS,
  resetChromiumLookup,
  screenshotChrome,
} from '../../../../src/render/x/screenshotChrome.js';

const opts = {
  html: '<html></html>',
  jobDir: '/tmp/job',
  width: 720,
  height: 800,
  jobId: 'j1',
  chromiumBin: 'chromium',
  persistent: false,
} as const;

describe('screenshotChrome', () => {
  beforeEach(() => {
    runProcess.mockReset().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    writeFile.mockReset().mockResolvedValue(undefined);
    rename.mockReset().mockResolvedValue(undefined);
    mkdir.mockReset().mockResolvedValue(undefined);
    access.mockReset().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    // Chromium usually writes a slightly different size → ffmpeg normalizes it.
    readFile.mockReset().mockResolvedValue(pngHeader(720, 801));
    resetChromiumLookup();
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
    expect(args).not.toContain('--enable-unsafe-swiftshader');
    expect(args).toContain('--disable-dev-shm-usage');
    expect(args).toContain('--no-first-run');
    expect(args).toContain('--disable-background-networking');
    expect(args).toContain('--disable-component-update');
    expect(args).toContain('--disable-breakpad');
    expect(args).toContain('--disable-features=OnDeviceModel,OptimizationGuideOnDeviceModel');
    expect(args).toContain(`--virtual-time-budget=${CHROME_VIRTUAL_TIME_MS}`);
    expect(args).toContain(`--timeout=${CHROME_TIMEOUT_MS}`);
    expect(args).toContain('--user-data-dir=/tmp/job/xchrome/user-data');
    expect(args).toContain('--window-size=720,800');
    expect(args).toContain('--screenshot=/tmp/job/xchrome/chrome.png');
    expect(args).toContain('file:///tmp/job/xchrome/chrome.html');
    expect(chromeOpts.timeoutMs).toBe(CHROME_PROCESS_TIMEOUT_MS);
    expect(chromeOpts.jobId).toBe('j1');

    const ffmpegCall = runProcess.mock.calls.find((call) => call[0] === 'ffmpeg');
    expect(ffmpegCall).toBeDefined();
    expect(ffmpegCall?.[2]?.timeoutMs).toBeUndefined();
  });

  it('uses old headless + SwiftShader for chromium-headless-shell', async () => {
    await screenshotChrome({ ...opts, chromiumBin: 'chromium-headless-shell' });

    const chromeCall = runProcess.mock.calls.find((call) => call[0] === 'chromium-headless-shell');
    expect(chromeCall).toBeDefined();
    const args = chromeCall?.[1] as string[];
    expect(args).toContain('--headless');
    expect(args).not.toContain('--headless=new');
    expect(args).toContain('--enable-unsafe-swiftshader');
    expect(args).toContain('--screenshot=/tmp/job/xchrome/chrome.png');
  });

  it('prefers chromium-headless-shell on PATH', async () => {
    runProcess.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === 'which') {
        const bin = Array.isArray(args) ? args[0] : undefined;
        if (bin === 'chromium-headless-shell') {
          return { stdout: '/usr/bin/chromium-headless-shell', stderr: '', exitCode: 0 };
        }
        throw new Error('not found');
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await screenshotChrome({
      html: opts.html,
      jobDir: opts.jobDir,
      width: opts.width,
      height: opts.height,
      jobId: opts.jobId,
      persistent: false,
    });

    expect(runProcess.mock.calls.some((call) => call[0] === 'chromium-headless-shell')).toBe(true);
    expect(runProcess.mock.calls.some((call) => call[0] === 'chromium')).toBe(false);
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

  it('skips the ffmpeg resize when the PNG is already the canvas size', async () => {
    readFile.mockResolvedValue(pngHeader(720, 800));
    await screenshotChrome(opts);
    expect(runProcess.mock.calls.some((call) => call[0] === 'ffmpeg')).toBe(false);
  });

  it('uses the shared browser and never spawns a one-shot Chromium', async () => {
    const screenshot = vi.fn().mockResolvedValue(pngHeader(720, 800));
    const withBrowser = vi.fn(async (_bin, _args, fn) => fn({ screenshot }));

    const png = await screenshotChrome({ ...opts, persistent: true, withBrowser });

    expect(png).toBe('/tmp/job/xchrome/chrome.png');
    const [bin, args] = withBrowser.mock.calls[0];
    expect(bin).toBe('chromium');
    expect(args).toContain('--headless=new');
    expect(args).toContain('--no-sandbox');
    // Headless "command" switches are rejected alongside remote debugging.
    expect(args).not.toContain('--default-background-color=00000000');
    expect(args.some((a: string) => a.startsWith('--screenshot'))).toBe(false);
    expect(screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'file:///tmp/job/xchrome/chrome.html',
        width: 720,
        height: 800,
      }),
    );
    expect(writeFile).toHaveBeenCalledWith('/tmp/job/xchrome/chrome.png', expect.any(Buffer));
    expect(runProcess.mock.calls.some((call) => call[0] === 'chromium')).toBe(false);
    expect(runProcess.mock.calls.some((call) => call[0] === 'ffmpeg')).toBe(false);
  });

  it('falls back to the one-shot CLI when the shared browser fails', async () => {
    const withBrowser = vi.fn().mockRejectedValue(new Error('pipe closed'));

    await screenshotChrome({ ...opts, persistent: true, withBrowser });

    const chromeCall = runProcess.mock.calls.find((call) => call[0] === 'chromium');
    expect(chromeCall?.[1]).toContain('--screenshot=/tmp/job/xchrome/chrome.png');
    expect(chromeCall?.[1]).toContain('--default-background-color=00000000');
  });

  it('looks up the Chromium binary once per process', async () => {
    runProcess.mockImplementation(async (cmd: string, args?: unknown) => {
      if (cmd === 'which') {
        if (Array.isArray(args) && args[0] === 'chromium')
          return { stdout: '', stderr: '', exitCode: 0 };
        throw new Error('not found');
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const { chromiumBin: _bin, ...noBin } = opts;
    await screenshotChrome(noBin);
    const lookups = runProcess.mock.calls.filter((call) => call[0] === 'which').length;
    await screenshotChrome(noBin);
    expect(runProcess.mock.calls.filter((call) => call[0] === 'which').length).toBe(lookups);
  });
});

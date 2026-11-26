import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CdpBrowser,
  CdpError,
  closeSharedBrowser,
  withSharedBrowser,
} from '../../../../src/render/x/chromiumBrowser.js';

const FAKE = fileURLToPath(
  new URL('../../../fixtures/chromium/fake-chromium.mjs', import.meta.url),
);

function withMode<T>(mode: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.FAKE_CHROMIUM_MODE;
  process.env.FAKE_CHROMIUM_MODE = mode;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.FAKE_CHROMIUM_MODE;
    else process.env.FAKE_CHROMIUM_MODE = prev;
  });
}

const shot = { url: 'file:///tmp/x/chrome.html', width: 720, height: 900, timeoutMs: 2_000 };

describe('CdpBrowser', () => {
  afterEach(async () => {
    await closeSharedBrowser();
  });

  it('screenshots a fresh target at the requested viewport', async () => {
    const browser = await CdpBrowser.launch(FAKE, []);
    try {
      const png = await browser.screenshot(shot);
      expect(png.toString()).toBe('PNG:file:///tmp/x/chrome.html:720x900');
      // A second screenshot reuses the same process.
      const again = await browser.screenshot({ ...shot, height: 640 });
      expect(again.toString()).toBe('PNG:file:///tmp/x/chrome.html:720x640');
      expect(browser.alive).toBe(true);
    } finally {
      await browser.close();
    }
    expect(browser.alive).toBe(false);
  });

  it('times out a page that never loads and closes the browser', async () => {
    await withMode('hang-load', async () => {
      const browser = await CdpBrowser.launch(FAKE, []);
      await expect(browser.screenshot({ ...shot, timeoutMs: 150 })).rejects.toThrow(/timed out/);
      expect(browser.alive).toBe(false);
    });
  });

  it('rejects in-flight calls when Chromium dies', async () => {
    await withMode('crash-shot', async () => {
      const browser = await CdpBrowser.launch(FAKE, []);
      await expect(browser.screenshot(shot)).rejects.toBeInstanceOf(CdpError);
      expect(browser.alive).toBe(false);
      await expect(browser.send('Browser.getVersion')).rejects.toThrow(/exited/);
    });
  });

  it('fails launch for a missing binary', async () => {
    await expect(CdpBrowser.launch('/nonexistent/chromium', [])).rejects.toBeInstanceOf(CdpError);
  });
});

describe('withSharedBrowser', () => {
  afterEach(async () => {
    await closeSharedBrowser();
  });

  it('reuses one browser process across jobs, including concurrent ones', async () => {
    const pids = await Promise.all(
      [1, 2, 3].map(() => withSharedBrowser(FAKE, [], async (b) => b.pid)),
    );
    const later = await withSharedBrowser(FAKE, [], async (b) => b.pid);
    expect(new Set([...pids, later]).size).toBe(1);
  });

  it('relaunches after the shared browser crashed', async () => {
    const first = await withMode('crash-shot', () =>
      withSharedBrowser(FAKE, [], async (b) => {
        await expect(b.screenshot(shot)).rejects.toBeInstanceOf(CdpError);
        return b.pid;
      }),
    );
    const png = await withSharedBrowser(FAKE, [], async (b) => {
      expect(b.pid).not.toBe(first);
      return b.screenshot(shot);
    });
    expect(png.toString()).toContain('720x900');
  });
});

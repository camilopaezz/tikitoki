import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { createLogger } from '../../util/logger.js';
import { JOB_TMP_ROOT } from '../../util/tmp.js';

const logger = createLogger();

/** Close the shared browser after this long without screenshots. */
export const BROWSER_IDLE_MS = 5 * 60_000;
/** Budget for spawning Chromium and answering the first CDP call. */
export const BROWSER_LAUNCH_TIMEOUT_MS = 10_000;

/**
 * Wait until web fonts and images are in, then two frames so layout and paint
 * have settled. Replaces `--virtual-time-budget` of the one-shot CLI path.
 */
const READY_EXPRESSION = `Promise.all([
  document.fonts.ready,
  ...Array.from(document.images, (img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })),
]).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))`;

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  sessionId?: string;
}

export class CdpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CdpError';
  }
}

export interface BrowserScreenshotOptions {
  url: string;
  width: number;
  height: number;
  timeoutMs: number;
}

/**
 * A long-lived headless Chromium driven over `--remote-debugging-pipe`
 * (null-delimited JSON on fds 3/4). One fresh target per screenshot, so jobs
 * never share page state; the process is reused to skip ~1.3 s of startup.
 */
export class CdpBrowser {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  private readonly listeners = new Map<(msg: CdpMessage) => void, string>();
  private stderrTail = '';
  private closedError: Error | undefined;
  private readonly exited: Promise<void>;

  private constructor(
    private readonly child: ChildProcess,
    private readonly input: Writable,
    private readonly output: Readable,
    private readonly userDataDir: string,
  ) {
    let chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => {
      let start = 0;
      let nul = chunk.indexOf(0);
      while (nul !== -1) {
        chunks.push(chunk.subarray(start, nul));
        this.dispatch(Buffer.concat(chunks).toString('utf8'));
        chunks = [];
        start = nul + 1;
        nul = chunk.indexOf(0, start);
      }
      if (start < chunk.length) chunks.push(chunk.subarray(start));
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-2000);
    });
    // Writes after Chromium died surface as EPIPE on the stream; the exit
    // handler below already fails every pending call.
    input.on('error', () => undefined);
    output.on('error', () => undefined);
    this.exited = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        this.fail(new CdpError(`Chromium exited (code=${code} signal=${signal})`));
        resolve();
      });
      child.once('error', (err) => {
        this.fail(new CdpError(`Chromium failed to start: ${err.message}`));
        resolve();
      });
    });
  }

  static async launch(bin: string, args: readonly string[]): Promise<CdpBrowser> {
    const userDataDir = join(JOB_TMP_ROOT, `chromium-${randomBytes(6).toString('hex')}`);
    await mkdir(userDataDir, { recursive: true });
    const child = spawn(
      bin,
      [...args, '--remote-debugging-pipe', `--user-data-dir=${userDataDir}`, 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
    );
    const input = child.stdio[3] as Writable | null;
    const output = child.stdio[4] as Readable | null;
    if (!input || !output) {
      child.kill('SIGKILL');
      throw new CdpError('Chromium did not expose the DevTools pipe');
    }
    const browser = new CdpBrowser(child, input, output, userDataDir);
    try {
      await withTimeout(browser.send('Browser.getVersion'), BROWSER_LAUNCH_TIMEOUT_MS, 'launch');
    } catch (err) {
      await browser.close();
      throw err;
    }
    return browser;
  }

  get alive(): boolean {
    return this.closedError === undefined;
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    if (this.closedError) return Promise.reject(this.closedError);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  }

  /** Register before triggering the action that emits the event. */
  waitForEvent(method: string, sessionId: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (this.closedError) {
        reject(this.closedError);
        return;
      }
      const listener = (msg: CdpMessage) => {
        if (msg === CLOSED) {
          this.listeners.delete(listener);
          reject(this.closedError);
        } else if (msg.method === method && msg.sessionId === sessionId) {
          this.listeners.delete(listener);
          resolve(msg.params ?? {});
        }
      };
      this.listeners.set(listener, sessionId);
    });
  }

  /** Forget event waiters for a session whose target is going away. */
  private dropSession(sessionId: string): void {
    for (const [listener, sid] of this.listeners) {
      if (sid === sessionId) this.listeners.delete(listener);
    }
  }

  /** Rasterize `url` in a fresh target at exactly `width`×`height` CSS px. */
  async screenshot(opts: BrowserScreenshotOptions): Promise<Buffer> {
    const { width, height } = opts;
    const run = async (): Promise<Buffer> => {
      const { targetId } = (await this.send('Target.createTarget', {
        url: 'about:blank',
        width,
        height,
      })) as { targetId: string };
      let sessionId: string | undefined;
      try {
        ({ sessionId } = (await this.send('Target.attachToTarget', {
          targetId,
          flatten: true,
        })) as { sessionId: string });
        await Promise.all([
          this.send(
            'Emulation.setDeviceMetricsOverride',
            { width, height, deviceScaleFactor: 1, mobile: false },
            sessionId,
          ),
          this.send(
            'Emulation.setDefaultBackgroundColorOverride',
            { color: { r: 0, g: 0, b: 0, a: 0 } },
            sessionId,
          ),
          this.send('Page.enable', {}, sessionId),
        ]);
        const loaded = this.waitForEvent('Page.loadEventFired', sessionId);
        loaded.catch(() => undefined); // may never be awaited if navigate fails
        const nav = (await this.send('Page.navigate', { url: opts.url }, sessionId)) as {
          errorText?: string;
        };
        if (nav.errorText) throw new CdpError(`Navigation failed: ${nav.errorText}`);
        await loaded;
        await this.send(
          'Runtime.evaluate',
          { expression: READY_EXPRESSION, awaitPromise: true, returnByValue: true },
          sessionId,
        );
        const { data } = (await this.send(
          'Page.captureScreenshot',
          { format: 'png', captureBeyondViewport: false },
          sessionId,
        )) as { data: string };
        return Buffer.from(data, 'base64');
      } finally {
        if (sessionId) this.dropSession(sessionId);
        this.send('Target.closeTarget', { targetId }).catch(() => undefined);
      }
    };

    try {
      return await withTimeout(run(), opts.timeoutMs, 'screenshot');
    } catch (err) {
      // A hung renderer can wedge the whole browser; start fresh next time.
      if (err instanceof TimeoutError) await this.close();
      throw err;
    }
  }

  /** Keep (or stop keeping) the Node event loop alive for this browser. */
  setRef(ref: boolean): void {
    for (const handle of [this.child, this.input, this.output, this.child.stderr]) {
      const h = handle as { ref?: () => void; unref?: () => void } | null;
      if (ref) h?.ref?.();
      else h?.unref?.();
    }
  }

  async close(): Promise<void> {
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill('SIGKILL');
    }
    this.fail(new CdpError('Chromium browser closed'));
    await withTimeout(this.exited, 5_000, 'exit').catch(() => undefined);
    await rm(this.userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }

  /** Synchronous kill for process `exit` hooks. */
  killSync(): void {
    try {
      this.child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }

  private dispatch(raw: string): void {
    let msg: CdpMessage;
    try {
      msg = JSON.parse(raw) as CdpMessage;
    } catch {
      return;
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new CdpError(`CDP ${msg.error.code}: ${msg.error.message}`));
      else p.resolve(msg.result ?? {});
      return;
    }
    for (const listener of [...this.listeners.keys()]) listener(msg);
  }

  private fail(err: Error): void {
    if (this.closedError) return;
    const tail = this.stderrTail.trim();
    this.closedError = tail ? new CdpError(`${err.message}: ${tail.slice(-500)}`) : err;
    for (const p of this.pending.values()) p.reject(this.closedError);
    this.pending.clear();
    for (const listener of [...this.listeners.keys()]) listener(CLOSED);
  }
}

/** Sentinel delivered to event listeners when the browser goes away. */
const CLOSED: CdpMessage = {};

class TimeoutError extends CdpError {
  constructor(what: string, ms: number) {
    super(`Chromium ${what} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ------------------------------------------------------------ shared browser

let shared: Promise<CdpBrowser> | undefined;
/** Last launched browser, for the synchronous `exit` hook. */
let current: CdpBrowser | undefined;
let active = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let exitHookInstalled = false;

async function launchShared(bin: string, args: readonly string[]): Promise<CdpBrowser> {
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', () => current?.killSync());
  }
  const browser = await CdpBrowser.launch(bin, args);
  current = browser;
  logger.info(`Started shared Chromium (pid ${browser.pid}) for xrender screenshots`);
  return browser;
}

/**
 * The launch promise is claimed synchronously so concurrent first callers
 * share one browser instead of racing to start several.
 */
async function acquire(bin: string, args: readonly string[]): Promise<CdpBrowser> {
  for (;;) {
    if (!shared) shared = launchShared(bin, args);
    const pending = shared;
    let browser: CdpBrowser;
    try {
      browser = await pending;
    } catch (err) {
      if (shared === pending) shared = undefined;
      throw err;
    }
    if (browser.alive) return browser;
    // Crashed or timed out since launch: drop it and start a fresh one.
    if (shared === pending) shared = undefined;
  }
}

/**
 * Run `fn` against the process-wide browser, launching it on first use and
 * closing it after {@link BROWSER_IDLE_MS} of inactivity. While idle the
 * browser does not keep Node alive.
 */
export async function withSharedBrowser<T>(
  bin: string,
  args: readonly string[],
  fn: (browser: CdpBrowser) => Promise<T>,
): Promise<T> {
  active++;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  let browser: CdpBrowser | undefined;
  try {
    browser = await acquire(bin, args);
    browser.setRef(true);
    return await fn(browser);
  } finally {
    active--;
    if (active === 0) {
      browser?.setRef(false);
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        if (active === 0) void closeSharedBrowser();
      }, BROWSER_IDLE_MS);
      idleTimer.unref();
    }
  }
}

export async function closeSharedBrowser(): Promise<void> {
  clearTimeout(idleTimer);
  idleTimer = undefined;
  const pending = shared;
  shared = undefined;
  current = undefined;
  const b = await pending?.catch(() => undefined);
  await b?.close();
}

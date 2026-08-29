import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROCESS_KILL_GRACE_MS,
  ProcessError,
  ProcessTimeoutError,
  runProcess,
} from '../../../src/process/run.js';

const mockSpawn = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

interface MockChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin?: { write: (data: string) => void; end: () => void };
  pid?: number;
  kill?: (signal?: NodeJS.Signals) => boolean;
}

function createMockChild(exitCode: number | null, stdout = '', stderr = '') {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: vi.fn(), end: vi.fn() };

  process.nextTick(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', exitCode);
  });

  return child;
}

describe('runProcess', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('resolves with stdout/stderr on exit code 0', async () => {
    mockSpawn.mockReturnValue(createMockChild(0, 'hello', 'warn'));
    const result = await runProcess('echo', ['hello']);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('warn');
    expect(result.exitCode).toBe(0);
  });

  it('rejects with ProcessError on non-zero exit', async () => {
    const stderr = 'something went wrong\nline two';
    mockSpawn.mockReturnValue(createMockChild(1, '', stderr));
    const err = await runProcess('bad', ['arg1', 'arg2']).catch((e) => e);
    expect(err).toBeInstanceOf(ProcessError);
    const error = err as ProcessError;
    expect(error.command).toBe('bad arg1 arg2');
    expect(error.exitCode).toBe(1);
    expect(error.stderrTail).toContain('line two');
    expect(error.message).toContain('line two');
  });

  it('rejects with ProcessError on spawn failure', async () => {
    const child = new EventEmitter();
    Object.assign(child, { stdout: new EventEmitter(), stderr: new EventEmitter() });
    mockSpawn.mockReturnValue(child);
    process.nextTick(() => child.emit('error', new Error('ENOENT')));
    await expect(runProcess('missing')).rejects.toBeInstanceOf(ProcessError);
  });

  it('does not detach when no timeout is set', async () => {
    mockSpawn.mockReturnValue(createMockChild(0));
    await runProcess('echo', ['ok']);
    const spawnOpts = mockSpawn.mock.calls[0][2] as { detached?: boolean };
    expect(spawnOpts.detached).toBeUndefined();
  });
});

describe('runProcess timeout', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function hangingChild(pid = 4242): MockChild {
    const child = new EventEmitter() as MockChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: vi.fn(), end: vi.fn() };
    child.pid = pid;
    child.kill = vi.fn();
    return child;
  }

  it('kills the process group and rejects ProcessTimeoutError', async () => {
    const child = hangingChild();
    mockSpawn.mockReturnValue(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = runProcess('chromium', ['--headless=new'], { timeoutMs: 1000 }).catch((e) => e);

    await vi.advanceTimersByTimeAsync(1000);
    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGKILL');
    expect(mockSpawn.mock.calls[0][2]).toMatchObject({ detached: true });

    child.emit('close', 137);
    const err = await result;
    expect(err).toBeInstanceOf(ProcessTimeoutError);
    expect((err as ProcessTimeoutError).timeoutMs).toBe(1000);
    expect((err as ProcessTimeoutError).message).toMatch(/timed out after 1000ms/);
  });

  it('rejects after kill grace if close never fires', async () => {
    mockSpawn.mockReturnValue(hangingChild());
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = runProcess('hang', [], { timeoutMs: 500 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(PROCESS_KILL_GRACE_MS);

    const err = await result;
    expect(err).toBeInstanceOf(ProcessTimeoutError);
  });

  it('resolves if the child exits 0 in the timeout race', async () => {
    const child = hangingChild();
    mockSpawn.mockReturnValue(child);
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const promise = runProcess('ok', [], { timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    child.emit('close', 0);
    await expect(promise).resolves.toMatchObject({ exitCode: 0 });
  });

  it('falls back to child.kill when process.kill of the group fails', async () => {
    const child = hangingChild();
    mockSpawn.mockReturnValue(child);
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });

    const result = runProcess('hang', [], { timeoutMs: 100 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null);
    await expect(result).resolves.toBeInstanceOf(ProcessTimeoutError);
  });
});

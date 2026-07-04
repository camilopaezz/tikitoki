import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessError, runProcess } from '../../../src/process/run.js';

const mockSpawn = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

interface MockChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin?: { write: (data: string) => void; end: () => void };
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
});

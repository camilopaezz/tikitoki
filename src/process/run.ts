import { spawn } from 'node:child_process';
import { createLogger } from '../util/logger.js';

const logger = createLogger();

/** Wait this long after SIGKILL for `close` before rejecting anyway. */
export const PROCESS_KILL_GRACE_MS = 5_000;

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  jobId?: string;
  /**
   * Kill the child (and its process group) if it has not exited by then.
   * Used for Chromium, which can hang forever in `--headless=new`.
   */
  timeoutMs?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly args: readonly string[],
    public readonly exitCode: number,
    public readonly stderrTail: string,
  ) {
    super(message);
    this.name = 'ProcessError';
  }
}

export class ProcessTimeoutError extends ProcessError {
  constructor(
    command: string,
    args: readonly string[],
    public readonly timeoutMs: number,
  ) {
    super(`Process timed out after ${timeoutMs}ms: ${command}`, command, args, -1, '');
    this.name = 'ProcessTimeoutError';
  }
}

function buildCommandString(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].join(' ');
}

function tail(text: string, maxLength = 2000): string {
  if (text.length <= maxLength) return text;
  return `...${text.slice(-maxLength)}`;
}

function killProcessTree(child: {
  pid?: number;
  kill: (signal?: NodeJS.Signals) => boolean;
}): void {
  if (child.pid !== undefined) {
    try {
      // Negative PID = process group. Requires `detached: true` at spawn.
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // Process already gone, or not a group leader (e.g. Windows).
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // Already exited.
  }
}

export function runProcess(
  cmd: string,
  args: readonly string[] = [],
  opts: RunOptions = {},
): Promise<RunResult> {
  const commandString = buildCommandString(cmd, args);
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  log.debug(`Spawning: ${commandString}`);

  const timeoutMs = opts.timeoutMs !== undefined && opts.timeoutMs > 0 ? opts.timeoutMs : undefined;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      // Own process group so timeout can SIGKILL Chromium and in-group
      // descendants (zygotes/renderers). Crashpad may have setsid'd out of
      // the group — tini as PID 1 reaps those orphans.
      ...(timeoutMs !== undefined ? { detached: true } : {}),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    }

    let finished = false;
    let timedOut = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void) => {
      if (finished) return;
      finished = true;
      if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      fn();
    };

    if (timeoutMs !== undefined) {
      timeoutTimer = setTimeout(() => {
        if (finished) return;
        timedOut = true;
        log.error(`Process timed out after ${timeoutMs}ms: ${commandString}`);
        killProcessTree(child);
        // D-state / already-zombie: still fail the job instead of waiting forever.
        graceTimer = setTimeout(() => {
          settle(() => {
            log.error(
              `Process still running after SIGKILL grace ${PROCESS_KILL_GRACE_MS}ms: ${commandString}`,
            );
            reject(new ProcessTimeoutError(commandString, args, timeoutMs));
          });
        }, PROCESS_KILL_GRACE_MS);
      }, timeoutMs);
    }

    child.on('error', (err) => {
      settle(() => {
        reject(
          new ProcessError(`Failed to spawn process: ${err.message}`, commandString, args, -1, ''),
        );
      });
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const exitCode = code ?? -1;

      settle(() => {
        if (timedOut) {
          // Timer and successful exit can race; don't fail a finished screenshot.
          if (exitCode === 0) {
            resolve({ stdout, stderr, exitCode });
            return;
          }
          reject(new ProcessTimeoutError(commandString, args, timeoutMs ?? 0));
          return;
        }

        if (exitCode !== 0) {
          log.error(`Process exited ${exitCode}: ${commandString}`);
          reject(
            new ProcessError(
              `Process exited with code ${exitCode}: ${tail(stderr)}`,
              commandString,
              args,
              exitCode,
              tail(stderr),
            ),
          );
          return;
        }

        resolve({ stdout, stderr, exitCode });
      });
    });
  });
}

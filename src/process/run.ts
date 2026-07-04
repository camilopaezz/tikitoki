import { spawn } from 'node:child_process';
import { createLogger } from '../util/logger.js';

const logger = createLogger();

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  jobId?: string;
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

function buildCommandString(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].join(' ');
}

function tail(text: string, maxLength = 2000): string {
  if (text.length <= maxLength) return text;
  return `...${text.slice(-maxLength)}`;
}

export function runProcess(
  cmd: string,
  args: readonly string[] = [],
  opts: RunOptions = {},
): Promise<RunResult> {
  const commandString = buildCommandString(cmd, args);
  const log = opts.jobId ? createLogger({ jobId: opts.jobId }) : logger;
  log.debug(`Spawning: ${commandString}`);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    if (opts.stdin !== undefined) {
      child.stdin?.write(opts.stdin);
      child.stdin?.end();
    }

    child.on('error', (err) => {
      reject(
        new ProcessError(`Failed to spawn process: ${err.message}`, commandString, args, -1, ''),
      );
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const exitCode = code ?? -1;

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
}

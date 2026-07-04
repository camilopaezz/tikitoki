export interface LogContext {
  jobId?: string;
  userId?: number | string;
  stage?: string;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function formatMessage(level: LogLevel, message: string, ctx: LogContext): string {
  const parts: string[] = [`[${level.toUpperCase()}]`];
  if (ctx.jobId) parts.push(`[jobId=${ctx.jobId}]`);
  if (ctx.userId !== undefined) parts.push(`[userId=${ctx.userId}]`);
  if (ctx.stage) parts.push(`[stage=${ctx.stage}]`);
  parts.push(message);
  return parts.join(' ');
}

function log(level: LogLevel, message: string, ctx: LogContext = {}): void {
  const line = formatMessage(level, message, ctx);
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      console.debug(line);
      break;
    default:
      console.info(line);
  }
}

export function createLogger(ctx: LogContext = {}) {
  return {
    with: (extra: LogContext) => createLogger({ ...ctx, ...extra }),
    debug: (message: string, extra: LogContext = {}) => log('debug', message, { ...ctx, ...extra }),
    info: (message: string, extra: LogContext = {}) => log('info', message, { ...ctx, ...extra }),
    warn: (message: string, extra: LogContext = {}) => log('warn', message, { ...ctx, ...extra }),
    error: (message: string, extra: LogContext = {}) => log('error', message, { ...ctx, ...extra }),
  };
}

export type Logger = ReturnType<typeof createLogger>;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WithOneRetryOptions {
  /** Delay before the single retry. Defaults to 1500ms. */
  delayMs?: number;
  /** Return false to skip the retry and rethrow immediately. Defaults to always retry. */
  isRetryable?: (err: unknown) => boolean;
  /** Called once before sleeping and retrying. */
  onRetry?: (err: unknown) => void;
}

/**
 * Run `fn` once; on failure, optionally wait and try exactly one more time.
 * Permanent errors should be filtered out via `isRetryable`.
 */
export async function withOneRetry<T>(
  fn: () => Promise<T>,
  opts: WithOneRetryOptions = {},
): Promise<T> {
  const { delayMs = 1500, isRetryable = () => true, onRetry } = opts;
  try {
    return await fn();
  } catch (err) {
    if (!isRetryable(err)) throw err;
    onRetry?.(err);
    if (delayMs > 0) await sleep(delayMs);
    return await fn();
  }
}

/** Flatten Error.message + cause (and nested cause) so errno codes surface. */
export function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  let cause: unknown = err.cause;
  // Bound depth so a weird cycle can't hang classification.
  for (let i = 0; i < 3 && cause instanceof Error; i++) {
    parts.push(cause.message);
    const code = (cause as NodeJS.ErrnoException).code;
    if (code) parts.push(code);
    cause = cause.cause;
  }
  return parts.join(' ');
}

/** Permanent HTTP client errors (except 429, which is transient rate limiting). */
export function isPermanentHttpClientError(err: unknown): boolean {
  const msg = errorText(err);
  // Match "HTTP Error 404", "Failed to download ...: 403", bare status codes after colon.
  // Negative lookahead keeps 429 retryable.
  return (
    /\bHTTP Error 4(?!29)\d\d\b/i.test(msg) ||
    // Use `.+` (not `[^:]+`) so https:// URLs don't truncate at the scheme colon.
    /Failed to download .+: 4(?!29)\d\d\b/i.test(msg)
  );
}

/**
 * Heuristic for network / rate-limit / server blips that are worth one retry.
 * Permanent client errors (404, 403, auth, no-video) should not match.
 */
export function isTransientDownloadError(err: unknown): boolean {
  if (isPermanentHttpClientError(err)) return false;

  const msg = errorText(err);
  return (
    /\b429\b/.test(msg) ||
    /rate.?limit/i.test(msg) ||
    /too many requests/i.test(msg) ||
    /HTTP Error 5\d\d/i.test(msg) ||
    /Failed to download .+: 5\d\d\b/i.test(msg) ||
    /timed?\s*out/i.test(msg) ||
    /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /temporarily unavailable/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /network (?:unreachable|error|is unreachable)/i.test(msg) ||
    // yt-dlp often prefixes transient failures this way *with* a transient reason.
    // Permanent 4xx already excluded above.
    /Unable to download/i.test(msg)
  );
}

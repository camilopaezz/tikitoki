import { HttpError } from 'grammy';
import { createLogger } from '../util/logger.js';
import { withOneRetry } from '../util/retry.js';

const logger = createLogger();

/** Retry transport failures once. Telegram API errors keep their existing handling. */
export function withTelegramRetry<T>(operation: () => Promise<T>): Promise<T> {
  return withOneRetry(operation, {
    isRetryable: (err) => err instanceof HttpError,
    onRetry: () => logger.warn('Telegram network request failed; retrying once'),
  });
}

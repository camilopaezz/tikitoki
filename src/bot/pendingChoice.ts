import { randomBytes } from 'node:crypto';
import type { JobMode } from '../job/types.js';

export interface PendingChoice {
  url: string;
  userId: number;
  chatId: number;
  createdAt: number;
}

export const PENDING_CHOICE_TTL_MS = 10 * 60 * 1000;

const CALLBACK_PREFIX = 'c:';

/** In-memory pending URL confirmations keyed by short token. */
export class PendingChoiceStore {
  private readonly map = new Map<string, PendingChoice>();

  constructor(
    private readonly ttlMs: number = PENDING_CHOICE_TTL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  create(entry: Omit<PendingChoice, 'createdAt'>): string {
    this.purgeExpired();
    const token = randomBytes(8).toString('hex');
    this.map.set(token, { ...entry, createdAt: this.now() });
    return token;
  }

  /**
   * Returns entry if present and not expired without removing it.
   * Expired tokens are deleted.
   */
  peek(token: string): PendingChoice | undefined {
    const entry = this.map.get(token);
    if (!entry) return undefined;
    if (this.now() - entry.createdAt > this.ttlMs) {
      this.map.delete(token);
      return undefined;
    }
    return entry;
  }

  /** Removes and returns the entry if present and not expired. */
  take(token: string): PendingChoice | undefined {
    const entry = this.peek(token);
    if (!entry) return undefined;
    this.map.delete(token);
    return entry;
  }

  size(): number {
    return this.map.size;
  }

  private purgeExpired() {
    const now = this.now();
    for (const [token, entry] of this.map) {
      if (now - entry.createdAt > this.ttlMs) {
        this.map.delete(token);
      }
    }
  }
}

export type ChoiceAction = 'dl' | 'xr';

export function encodeCallbackData(action: ChoiceAction, token: string): string {
  return `${CALLBACK_PREFIX}${action}:${token}`;
}

export function parseCallbackData(
  data: string,
): { action: ChoiceAction; token: string } | undefined {
  if (!data.startsWith(CALLBACK_PREFIX)) return undefined;
  const match = /^(dl|xr):([a-f0-9]+)$/.exec(data.slice(CALLBACK_PREFIX.length));
  if (!match) return undefined;
  return { action: match[1] as ChoiceAction, token: match[2] };
}

export function modeFromAction(action: ChoiceAction): JobMode {
  return action === 'xr' ? 'xrender' : 'passthrough';
}

import { describe, expect, it } from 'vitest';
import {
  encodeCallbackData,
  modeFromAction,
  PendingChoiceStore,
  parseCallbackData,
} from '../../../src/bot/pendingChoice.js';

describe('PendingChoiceStore', () => {
  it('creates a token and returns the entry on take', () => {
    const store = new PendingChoiceStore();
    const token = store.create({
      url: 'https://x.com/u/status/1',
      userId: 42,
      chatId: 99,
    });

    expect(token).toMatch(/^[a-f0-9]{16}$/);
    expect(store.size()).toBe(1);

    const entry = store.take(token);
    expect(entry).toMatchObject({
      url: 'https://x.com/u/status/1',
      userId: 42,
      chatId: 99,
    });
    expect(store.take(token)).toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it('peek does not remove the entry', () => {
    const store = new PendingChoiceStore();
    const token = store.create({
      url: 'https://x.com/u/status/1',
      userId: 1,
      chatId: 2,
    });

    expect(store.peek(token)?.userId).toBe(1);
    expect(store.peek(token)?.userId).toBe(1);
    expect(store.size()).toBe(1);
  });

  it('expires entries after TTL', () => {
    let now = 1_000_000;
    const store = new PendingChoiceStore(1_000, () => now);
    const token = store.create({
      url: 'https://x.com/u/status/1',
      userId: 1,
      chatId: 2,
    });

    now += 1_001;
    expect(store.peek(token)).toBeUndefined();
    expect(store.take(token)).toBeUndefined();
  });
});

describe('callback data helpers', () => {
  it('round-trips encode and parse', () => {
    const token = 'deadbeefcafebabe';
    expect(parseCallbackData(encodeCallbackData('dl', token))).toEqual({
      action: 'dl',
      token,
    });
    expect(parseCallbackData(encodeCallbackData('xr', token))).toEqual({
      action: 'xr',
      token,
    });
  });

  it('rejects unknown callback data', () => {
    expect(parseCallbackData('other')).toBeUndefined();
    expect(parseCallbackData('x:dl:deadbeefcafebabe')).toBeUndefined();
    expect(parseCallbackData('c:zz:deadbeefcafebabe')).toBeUndefined();
  });

  it('maps actions to job modes', () => {
    expect(modeFromAction('dl')).toBe('passthrough');
    expect(modeFromAction('xr')).toBe('xrender');
  });
});

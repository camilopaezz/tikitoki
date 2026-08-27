import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStopwatch } from '../../../src/util/stopwatch.js';

describe('createStopwatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records lap deltas and total from start', () => {
    const sw = createStopwatch();
    vi.advanceTimersByTime(40);
    expect(sw.lap('a')).toBe(40);
    vi.advanceTimersByTime(25);
    expect(sw.lap('b')).toBe(25);
    expect(sw.marks()).toEqual({ a: 40, b: 25 });
    vi.advanceTimersByTime(10);
    expect(sw.total()).toBe(75);
  });

  it('overwrites a repeated lap name', () => {
    const sw = createStopwatch();
    vi.advanceTimersByTime(10);
    sw.lap('x');
    vi.advanceTimersByTime(20);
    expect(sw.lap('x')).toBe(20);
    expect(sw.marks()).toEqual({ x: 20 });
  });
});

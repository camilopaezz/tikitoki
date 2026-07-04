import { beforeEach, describe, expect, it } from 'vitest';
import { HourlyCap, HourlyCapError } from '../../../src/job/hourlyCap.js';

describe('HourlyCap', () => {
  let cap: HourlyCap;

  beforeEach(() => {
    cap = new HourlyCap(3);
  });

  it('allows submissions up to the cap', () => {
    cap.tryStart(0);
    cap.tryStart(1000);
    cap.tryStart(2000);
    expect(cap.count(2000)).toBe(3);
  });

  it('rejects the submission that exceeds the cap', () => {
    cap.tryStart(0);
    cap.tryStart(1000);
    cap.tryStart(2000);
    expect(() => cap.tryStart(3000)).toThrow(HourlyCapError);
  });

  it('reclaims slots after the window expires', () => {
    cap.tryStart(0);
    cap.tryStart(1000);
    cap.tryStart(2000);
    // After one hour + 1ms, starts at 0 and 1000 have fallen out of the window.
    expect(cap.count(60 * 60 * 1000 + 1)).toBe(2);
    // After one hour + 1.5s, only the latest start remains in the window.
    expect(cap.count(60 * 60 * 1000 + 1500)).toBe(1);
  });
});

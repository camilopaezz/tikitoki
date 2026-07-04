import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cookieArgs } from '../../../src/fetch/cookies.js';

describe('cookieArgs', () => {
  it('returns no args when cookiesPath is omitted', () => {
    expect(cookieArgs()).toEqual([]);
  });

  it('returns no args when cookiesPath is empty', () => {
    expect(cookieArgs('')).toEqual([]);
  });

  it('passes --cookies with an absolute path unchanged', () => {
    expect(cookieArgs('/data/ig.txt')).toEqual(['--cookies', '/data/ig.txt']);
  });

  it('resolves a relative cookies path to an absolute path', () => {
    const result = cookieArgs('cookies/instagram.txt');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('--cookies');
    expect(isAbsolute(result[1])).toBe(true);
    expect(result[1].endsWith('cookies/instagram.txt')).toBe(true);
  });

  it('does not pass a bare relative path that breaks under a different cwd', () => {
    const result = cookieArgs('cookies/instagram.txt');
    expect(result[1]).not.toBe('cookies/instagram.txt');
  });
});

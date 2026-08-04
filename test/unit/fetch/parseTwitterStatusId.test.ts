import { describe, expect, it } from 'vitest';
import { parseTwitterStatusId } from '../../../src/fetch/parseTwitterStatusId.js';

describe('parseTwitterStatusId', () => {
  it('parses x.com user status URLs', () => {
    expect(parseTwitterStatusId('https://x.com/user/status/1234567890')).toBe('1234567890');
  });

  it('parses /i/status URLs', () => {
    expect(parseTwitterStatusId('https://x.com/i/status/2084391060336259405')).toBe(
      '2084391060336259405',
    );
  });

  it('parses twitter.com and strips query', () => {
    expect(parseTwitterStatusId('https://twitter.com/user/status/99?s=20')).toBe('99');
  });

  it('parses /statuses/ legacy path', () => {
    expect(parseTwitterStatusId('https://x.com/user/statuses/42')).toBe('42');
  });

  it('returns undefined for non-twitter hosts', () => {
    expect(parseTwitterStatusId('https://tiktok.com/@u/video/1')).toBeUndefined();
  });

  it('returns undefined without a status id', () => {
    expect(parseTwitterStatusId('https://x.com/user')).toBeUndefined();
  });
});

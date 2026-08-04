import { describe, expect, it } from 'vitest';
import {
  sliceDisplayText,
  truncateTweetText,
  upscaleAvatarUrl,
} from '../../../src/fetch/truncateTweetText.js';

describe('sliceDisplayText', () => {
  it('returns empty when range is empty (media-only t.co)', () => {
    expect(sliceDisplayText('https://t.co/KfWRk40HyL', [0, 0])).toBe('');
  });

  it('slices by display_text_range', () => {
    expect(sliceDisplayText('Hello world https://t.co/x', [0, 11])).toBe('Hello world');
  });

  it('returns full trimmed text when range missing', () => {
    expect(sliceDisplayText('  hi  ', undefined)).toBe('hi');
  });
});

describe('truncateTweetText', () => {
  it('returns empty for blank input', () => {
    expect(truncateTweetText('   ')).toBe('');
  });

  it('leaves short text alone', () => {
    expect(truncateTweetText('She needs a Bbl')).toBe('She needs a Bbl');
  });

  it('appends ellipsis when over maxChars', () => {
    const long = 'word '.repeat(50).trim();
    const out = truncateTweetText(long, 3, 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(42);
  });
});

describe('upscaleAvatarUrl', () => {
  it('upgrades _normal to _400x400', () => {
    expect(upscaleAvatarUrl('https://pbs.twimg.com/profile_images/1/biY5ktzd_normal.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/biY5ktzd_400x400.jpg',
    );
  });

  it('upgrades _200x200', () => {
    expect(upscaleAvatarUrl('https://pbs.twimg.com/profile_images/1/x_200x200.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/x_400x400.jpg',
    );
  });

  it('returns undefined for missing url', () => {
    expect(upscaleAvatarUrl(undefined)).toBeUndefined();
  });
});

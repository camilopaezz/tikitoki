import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  sliceDisplayText,
  stripTcoUrls,
  truncateTweetText,
  upscaleAvatarUrl,
} from '../../../src/fetch/truncateTweetText.js';

describe('decodeHtmlEntities', () => {
  it('decodes common named entities from syndication text', () => {
    expect(decodeHtmlEntities('&gt; You are a Claude agent')).toBe('> You are a Claude agent');
    expect(decodeHtmlEntities('a &amp; b &lt; c')).toBe('a & b < c');
    expect(decodeHtmlEntities('say &quot;hi&quot;')).toBe('say "hi"');
  });

  it('decodes decimal and hex numeric entities', () => {
    expect(decodeHtmlEntities('&#62; tip')).toBe('> tip');
    expect(decodeHtmlEntities('&#x3e; tip')).toBe('> tip');
    expect(decodeHtmlEntities('&#x3E; tip')).toBe('> tip');
  });

  it('keeps a literally typed &gt; sequence when the API single-encoded it as &amp;gt;', () => {
    expect(decodeHtmlEntities('type &amp;gt; here')).toBe('type &gt; here');
  });

  it('is a no-op when there is no ampersand', () => {
    expect(decodeHtmlEntities('plain > text')).toBe('plain > text');
  });
});

describe('stripTcoUrls', () => {
  it('removes bare media t.co captions', () => {
    expect(stripTcoUrls('https://t.co/iThHYHmd82')).toBe('');
  });

  it('removes t.co while keeping real caption text', () => {
    expect(stripTcoUrls('Golazo https://t.co/abc more')).toBe('Golazo more');
  });
});

describe('sliceDisplayText', () => {
  it('returns empty when range is empty (media-only t.co)', () => {
    expect(sliceDisplayText('https://t.co/KfWRk40HyL', [0, 0])).toBe('');
  });

  it('slices by display_text_range', () => {
    expect(sliceDisplayText('Hello world https://t.co/x', [0, 11])).toBe('Hello world');
  });

  it('strips t.co even when range includes the short link', () => {
    expect(sliceDisplayText('https://t.co/iThHYHmd82', [0, 23])).toBe('');
    expect(sliceDisplayText('Hi https://t.co/abc', undefined)).toBe('Hi');
  });

  it('returns full trimmed text when range missing', () => {
    expect(sliceDisplayText('  hi  ', undefined)).toBe('hi');
  });

  it('decodes entities after applying display_text_range on the encoded string', () => {
    // Range indexes the encoded payload: "&gt; hi" is 7 UTF-16 units.
    expect(sliceDisplayText('&gt; hi https://t.co/x', [0, 7])).toBe('> hi');
  });
});

describe('truncateTweetText', () => {
  it('returns empty for blank input', () => {
    expect(truncateTweetText('   ')).toBe('');
  });

  it('leaves short text alone', () => {
    expect(truncateTweetText('She needs a Bbl')).toBe('She needs a Bbl');
  });

  it('never keeps t.co in chrome text', () => {
    expect(truncateTweetText('https://t.co/iThHYHmd82')).toBe('');
    expect(truncateTweetText('Watch this https://t.co/xyz')).toBe('Watch this');
  });

  it('preserves hard line breaks (does not flatten multi-line captions)', () => {
    const multi = '“🇪🇺🇺🇦🇹🇼”\n“From France”\n“I hate the proletariat”';
    expect(truncateTweetText(multi)).toBe(multi);
  });

  it('preserves a blank line between paragraphs (X feed style)', () => {
    const withGap =
      'Entra una chica sefardí para el Departamento de Finanzas de la empresa.\n\nMi compañero depravado:';
    expect(truncateTweetText(withGap)).toBe(withGap);
    expect(truncateTweetText(withGap)).toContain('\n\n');
  });

  it('caps hard lines at maxLines', () => {
    const out = truncateTweetText('a\nb\nc\nd', 3, 140);
    expect(out.split('\n')).toHaveLength(3);
    expect(out.endsWith('…')).toBe(true);
  });

  it('appends ellipsis when over maxChars', () => {
    const long = 'word '.repeat(50).trim();
    const out = truncateTweetText(long, 3, 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(42);
  });

  it('counts maxChars on decoded text so entity markup does not inflate length', () => {
    // 20× "&gt;" = 80 entity chars but only 20 ">" glyphs.
    const encoded = '&gt;'.repeat(20);
    expect(truncateTweetText(encoded, 3, 20)).toBe('>'.repeat(20));
    expect(truncateTweetText(encoded, 3, 10)).toBe(`${'>'.repeat(10)}…`);
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

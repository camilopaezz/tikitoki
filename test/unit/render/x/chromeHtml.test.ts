import { describe, expect, it } from 'vitest';
import type { XPostAssets } from '../../../../src/fetch/downloadXAssets.js';
import { buildChromeHtml } from '../../../../src/render/x/chromeHtml.js';
import { layoutXPost } from '../../../../src/render/x/layout.js';

const base: XPostAssets = {
  layoutKind: 'simple_video',
  statusId: '1',
  sourceUrl: 'https://x.com/u/status/1',
  outer: {
    author: {
      name: 'brandon*',
      handle: 'brndxix',
      avatarPath: '/tmp/a.jpg',
      verified: true,
    },
    text: { text: '', displayText: '' },
  },
  primaryVideo: { path: '/v.mp4', width: 960, height: 720, durationSec: 12 },
};

describe('buildChromeHtml', () => {
  it('uses flow layout with fixed media size and chromakey hole (no absolute Y)', () => {
    const layout = layoutXPost(base);
    const html = buildChromeHtml(base, layout);
    const slot = layout.mediaSlot;
    expect(html).toContain('data-media-hole');
    expect(html).toContain('class="media-wrap"');
    expect(html).toContain(`width: ${slot.w}px`);
    expect(html).toContain(`height: ${slot.h}px`);
    expect(html).toContain(`data-w="${slot.w}"`);
    expect(html).toContain(`data-h="${slot.h}"`);
    // Hole follows text in flow — not positioned with layout-estimated top.
    expect(html).not.toContain('data-y=');
    expect(html).toContain('brandon*');
    expect(html).toContain('@brndxix');
    expect(html).toContain('#1e9cf1'); // verified badge
    expect(html).toContain('#00ff00'); // chroma-key media hole
    expect(html).toContain('font-family: TwitterChirp');
    expect(html).not.toContain('@font-face');
    expect(html).not.toMatch(/duration|mute|0:12|00:12/i);
  });

  it('renders quote text card in flow (no absolute top)', () => {
    const assets: XPostAssets = {
      ...base,
      layoutKind: 'video_quotes',
      quote: {
        author: { name: '.🪐', handle: 'kbbetaV2', verified: false },
        text: { text: 'She needs a Bbl', displayText: 'She needs a Bbl' },
        images: [],
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    expect(html).toContain('She needs a Bbl');
    expect(html).toContain('@kbbetaV2');
    expect(html).toMatch(/class="quote"/);
    expect(html).not.toMatch(/class="quote quote-single"/);
    expect(html).not.toMatch(/class="quote"[^>]*top:/);
    // Feed: quote aligns with text column (right of avatar), not full card width.
    expect(html).toMatch(/class="quote"[^>]*margin-left:/);
  });

  it('places single quote image left of body text with author above (feed)', () => {
    const assets: XPostAssets = {
      ...base,
      layoutKind: 'video_quotes',
      quote: {
        author: { name: 'morenza', handle: 'morenza_14', verified: false },
        text: {
          text: 'CARVAJAL AL DEPOR',
          displayText: 'CARVAJAL AL DEPOR',
        },
        images: [{ path: '/tmp/q.jpg' }],
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    expect(html).toMatch(/class="quote quote-single"/);
    expect(html).toMatch(/class="qimg qimg-single"/);
    expect(html).toContain('class="quote-body"');
    expect(html).not.toMatch(/class="qimgs"/);
    // Body markup: author head before image row; image before body text.
    const body = html.slice(html.indexOf('<body>'));
    expect(body.indexOf('quote-head')).toBeLessThan(body.indexOf('quote-body'));
    expect(body.indexOf('qimg-single')).toBeLessThan(body.indexOf('class="qtext"'));
  });

  it('keeps multi-image quote as a grid under text', () => {
    const assets: XPostAssets = {
      ...base,
      layoutKind: 'video_quotes',
      quote: {
        author: { name: 'Q', handle: 'q', verified: false },
        text: { text: 'two pics', displayText: 'two pics' },
        images: [{ path: '/a.jpg' }, { path: '/b.jpg' }],
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    expect(html).not.toMatch(/class="quote quote-single"/);
    expect(html).toMatch(/class="qimgs"/);
    expect(html).toMatch(/grid-template-columns:\s*repeat\(2/);
    expect(html).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
  });

  it('gives outer caption more visual lines than the quote card', () => {
    const assets: XPostAssets = {
      ...base,
      outer: {
        ...base.outer,
        text: {
          text: '*Lo funan por Groomer*\n\nOtros: "era humor de la época, un pobre bebé de 40 años".\n\nMi Mundo Alex:',
          displayText:
            '*Lo funan por Groomer*\n\nOtros: "era humor de la época, un pobre bebé de 40 años".\n\nMi Mundo Alex:',
        },
      },
      layoutKind: 'video_quotes',
      quote: {
        author: { name: 'Q', handle: 'q', verified: false },
        text: { text: 'short', displayText: 'short' },
        images: [],
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    expect(html).toMatch(/\.text\s*\{[^}]*-webkit-line-clamp:\s*10/s);
    expect(html).toMatch(/\.qtext\s*\{[^}]*-webkit-line-clamp:\s*3/s);
    const body = html.slice(html.indexOf('<body>'));
    expect(body).toContain('pobre bebé de 40 años');
    expect(body).toContain('Mi Mundo Alex:');
  });

  it('clamps quote body to 3 visual lines', () => {
    const assets: XPostAssets = {
      ...base,
      layoutKind: 'video_quotes',
      quote: {
        author: { name: 'Q', handle: 'q', verified: false },
        text: {
          text: 'one\n\ntwo\n\nthree\n\nfour extra paragraph',
          displayText: 'one\n\ntwo\n\nthree\n\nfour extra paragraph',
        },
        images: [],
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    expect(html).toMatch(/\.qtext\s*\{[^}]*-webkit-line-clamp:\s*3/s);
  });

  it('does not double-escape syndication HTML entities in caption text', () => {
    const assets: XPostAssets = {
      ...base,
      outer: {
        ...base.outer,
        text: {
          text: '&gt; You are a Claude agent &amp; friend',
          // Simulate a caller that still has encoded displayText; truncate decodes first.
          displayText: '&gt; You are a Claude agent &amp; friend',
        },
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    const body = html.slice(html.indexOf('<body>'));
    expect(body).toContain('&gt; You are a Claude agent &amp; friend');
    expect(body).not.toContain('&amp;gt;');
    expect(body).not.toContain('&amp;amp;');
  });

  it('places the media hole inside the quote card for quote_of_video', () => {
    const assets: XPostAssets = {
      ...base,
      layoutKind: 'quote_of_video',
      quote: {
        author: { name: 'Deportes RCN', handle: 'DeportesRCN', verified: false },
        text: { text: '¡LO HIZO!', displayText: '¡LO HIZO!' },
        images: [],
      },
    };
    const html = buildChromeHtml(assets, layoutXPost(assets));
    const body = html.slice(html.indexOf('<body>'));
    expect(body).toContain('class="quote"');
    expect(body).toContain('data-media-hole');
    expect(body.indexOf('class="quote"')).toBeLessThan(body.indexOf('data-media-hole'));
    expect(body.indexOf('data-media-hole')).toBeLessThan(body.indexOf('</div>\n      </div>'));
    // No sibling hole before the quote.
    const beforeQuote = body.slice(0, body.indexOf('class="quote"'));
    expect(beforeQuote).not.toContain('data-media-hole');
  });
});

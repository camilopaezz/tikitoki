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
    expect(html).toContain('#1d9bf0'); // verified badge
    expect(html).toContain('#00ff00'); // chroma-key media hole
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
    expect(html).toContain('class="quote"');
    expect(html).not.toMatch(/class="quote"[^>]*top:/);
  });
});

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
  it('includes chroma media hole at exact layout coords and no duration/mute', () => {
    const layout = layoutXPost(base);
    const html = buildChromeHtml(base, layout);
    const slot = layout.mediaSlot;
    expect(html).toContain('data-media-hole');
    expect(html).toContain(`left: ${slot.x}px`);
    expect(html).toContain(`top: ${slot.y}px`);
    expect(html).toContain(`width: ${slot.w}px`);
    expect(html).toContain(`height: ${slot.h}px`);
    expect(html).toContain(`data-x="${slot.x}"`);
    expect(html).toContain(`data-y="${slot.y}"`);
    expect(html).toContain('brandon*');
    expect(html).toContain('@brndxix');
    expect(html).toContain('#1d9bf0'); // verified badge
    expect(html).toContain('#00ff00'); // chroma-key media hole
    expect(html).not.toMatch(/duration|mute|0:12|00:12/i);
  });

  it('renders quote text card', () => {
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
  });
});

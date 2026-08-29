import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyLayout,
  mapTwitterChrome,
  type SyndicationTweet,
  TwitterChromeMapError,
} from '../../../src/fetch/mapTwitterChrome.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures/twitter');

function loadFixture(name: string): SyndicationTweet {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as SyndicationTweet;
}

describe('classifyLayout', () => {
  it('classifies simple video', () => {
    expect(classifyLayout(true, null)).toEqual({
      layoutKind: 'simple_video',
      primaryIsQuoted: false,
    });
  });

  it('classifies video_quotes when outer has video and quote exists', () => {
    expect(classifyLayout(true, { text: 'hi' })).toEqual({
      layoutKind: 'video_quotes',
      primaryIsQuoted: false,
    });
  });

  it('classifies quote_of_video when only quote has video', () => {
    const quote: SyndicationTweet = {
      mediaDetails: [{ type: 'video', video_info: { variants: [{ url: 'http://x/v.mp4' }] } }],
    };
    expect(classifyLayout(false, quote)).toEqual({
      layoutKind: 'quote_of_video',
      primaryIsQuoted: true,
    });
  });

  it('errors when no video anywhere', () => {
    expect(classifyLayout(false, { text: 'no media' })).toEqual({ error: 'no_primary_video' });
  });
});

describe('mapTwitterChrome', () => {
  it('maps the real video_quotes text-only syndication fixture', () => {
    const raw = loadFixture('syndication-video-quotes-text.json');
    const chrome = mapTwitterChrome(raw, {
      sourceUrl: 'https://x.com/i/status/2084391060336259405',
    });

    expect(chrome.layoutKind).toBe('video_quotes');
    expect(chrome.statusId).toBe('2084391060336259405');
    expect(chrome.outer.author.handle).toBe('brndxix');
    expect(chrome.outer.author.name).toBe('brandon*');
    expect(chrome.outer.author.verified).toBe(true);
    expect(chrome.outer.author.avatarUrl).toMatch(/_400x400/);
    // media-only outer caption
    expect(chrome.outer.text.displayText).toBe('');
    expect(chrome.primaryVideo.url).toMatch(/\.mp4/);
    expect(chrome.primaryVideo.width).toBe(960);
    expect(chrome.primaryVideo.height).toBe(720);
    expect(chrome.quote?.author.handle).toBe('kbbetaV2');
    expect(chrome.quote?.text.displayText).toBe('She needs a Bbl');
    expect(chrome.quote?.images).toEqual([]);
  });

  it('decodes HTML entities in captions and author names', () => {
    const raw: SyndicationTweet = {
      id_str: '2',
      text: '&gt; tip &amp; tricks https://t.co/abc',
      // "&gt; tip &amp; tricks" is 21 UTF-16 units in the encoded syndication string.
      display_text_range: [0, 21],
      user: {
        name: 'Tom &amp; Jerry',
        screen_name: 'tj',
        is_blue_verified: false,
      },
      mediaDetails: [
        {
          type: 'video',
          video_info: {
            variants: [
              { content_type: 'video/mp4', url: 'https://video.twimg.com/a.mp4', bitrate: 1000 },
            ],
          },
        },
      ],
    };

    const chrome = mapTwitterChrome(raw, { sourceUrl: 'https://x.com/tj/status/2' });
    expect(chrome.outer.author.name).toBe('Tom & Jerry');
    expect(chrome.outer.text.displayText).toBe('> tip & tricks');
  });

  it('maps a synthetic simple_video tweet', () => {
    const raw: SyndicationTweet = {
      id_str: '1',
      text: 'Golazo https://t.co/abc',
      display_text_range: [0, 6],
      user: {
        name: 'Fútbol',
        screen_name: 'futbol',
        profile_image_url_https: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
        is_blue_verified: false,
      },
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/thumb.jpg',
          original_info: { width: 720, height: 1280 },
          video_info: {
            duration_millis: 8000,
            variants: [
              { content_type: 'video/mp4', url: 'https://video.twimg.com/a.mp4', bitrate: 1000 },
            ],
          },
        },
      ],
    };

    const chrome = mapTwitterChrome(raw, { sourceUrl: 'https://x.com/futbol/status/1' });
    expect(chrome.layoutKind).toBe('simple_video');
    expect(chrome.outer.text.displayText).toBe('Golazo');
    expect(chrome.primaryVideo.durationSec).toBe(8);
    expect(chrome.quote).toBeUndefined();
  });

  it('maps quote_of_video when only nested card has video', () => {
    const raw: SyndicationTweet = {
      id_str: '10',
      text: 'Historia',
      display_text_range: [0, 8],
      user: { name: 'Juan', screen_name: 'juan', is_blue_verified: false },
      quoted_tweet: {
        id_str: '11',
        text: 'Gol',
        display_text_range: [0, 3],
        user: {
          name: 'RCN',
          screen_name: 'rcn',
          is_blue_verified: true,
          profile_image_url_https: 'https://pbs.twimg.com/profile_images/2/b_normal.jpg',
        },
        mediaDetails: [
          {
            type: 'video',
            original_info: { width: 1280, height: 720 },
            video_info: {
              variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/q.mp4' }],
            },
          },
        ],
      },
    };

    const chrome = mapTwitterChrome(raw, { sourceUrl: 'https://x.com/juan/status/10' });
    expect(chrome.layoutKind).toBe('quote_of_video');
    expect(chrome.primaryVideo.url).toContain('q.mp4');
    expect(chrome.quote?.author.verified).toBe(true);
  });

  it('maps video_quotes with static images in the quote', () => {
    const raw: SyndicationTweet = {
      id_str: '20',
      text: 'Leak',
      display_text_range: [0, 4],
      user: { name: 'Hags', screen_name: 'hags', is_blue_verified: true },
      video: {
        durationMs: 5000,
        poster: 'https://pbs.twimg.com/p.jpg',
        variants: [{ type: 'video/mp4', src: 'https://video.twimg.com/main.mp4' }],
        aspectRatio: [16, 9],
      },
      mediaDetails: [{ type: 'video', video_info: { variants: [] } }],
      quoted_tweet: {
        id_str: '21',
        text: 'Details…',
        display_text_range: [0, 8],
        user: { name: 'Intel', screen_name: 'intel' },
        photos: [
          { url: 'https://pbs.twimg.com/media/a.jpg', width: 100, height: 100 },
          { url: 'https://pbs.twimg.com/media/b.jpg', width: 100, height: 100 },
        ],
      },
    };

    const chrome = mapTwitterChrome(raw, { sourceUrl: 'https://x.com/hags/status/20' });
    expect(chrome.layoutKind).toBe('video_quotes');
    expect(chrome.quote?.images).toHaveLength(2);
    expect(chrome.primaryVideo.url).toContain('main.mp4');
  });

  it('rejects multi-video primary posts', () => {
    const raw: SyndicationTweet = {
      id_str: '30',
      user: { name: 'A', screen_name: 'a' },
      mediaDetails: [
        {
          type: 'video',
          video_info: { variants: [{ content_type: 'video/mp4', url: 'https://v/1.mp4' }] },
        },
        {
          type: 'video',
          video_info: { variants: [{ content_type: 'video/mp4', url: 'https://v/2.mp4' }] },
        },
      ],
    };
    expect(() => mapTwitterChrome(raw, { sourceUrl: 'https://x.com/a/status/30' })).toThrow(
      TwitterChromeMapError,
    );
  });

  it('rejects posts with no video', () => {
    const raw: SyndicationTweet = {
      id_str: '40',
      text: 'hello',
      display_text_range: [0, 5],
      user: { name: 'A', screen_name: 'a' },
    };
    expect(() => mapTwitterChrome(raw, { sourceUrl: 'https://x.com/a/status/40' })).toThrow(
      /video/i,
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  extractImagePostFromHtml,
  extractMusicDurationFromHtml,
} from '../../../src/fetch/extractImagePost.js';

function makePage(itemStruct: object): string {
  const data = {
    __DEFAULT_SCOPE__: {
      'webapp.video-detail': {
        itemInfo: { itemStruct },
      },
    },
  };
  return `<html><body>
    <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
      ${JSON.stringify(data)}
    </script>
  </body></html>`;
}

describe('extractImagePostFromHtml', () => {
  it('extracts slide image URLs from imagePost', () => {
    const html = makePage({
      imagePost: {
        images: [
          {
            imageURL: { urlList: ['https://cdn.example.com/slide1.jpeg'] },
            imageWidth: 1080,
            imageHeight: 1920,
          },
          {
            imageURL: { urlList: ['https://cdn.example.com/slide2.jpeg'] },
            imageWidth: 1080,
            imageHeight: 1920,
          },
          {
            imageURL: { urlList: ['https://cdn.example.com/slide3.jpeg'] },
            imageWidth: 1080,
            imageHeight: 1920,
          },
        ],
      },
    });
    const slides = extractImagePostFromHtml(html);
    expect(slides).toHaveLength(3);
    expect(slides[0].url).toBe('https://cdn.example.com/slide1.jpeg');
    expect(slides[0].width).toBe(1080);
    expect(slides[0].height).toBe(1920);
    expect(slides[2].url).toBe('https://cdn.example.com/slide3.jpeg');
  });

  it('returns empty array when imagePost is missing', () => {
    const html = makePage({ video: { duration: 10 } });
    const slides = extractImagePostFromHtml(html);
    expect(slides).toEqual([]);
  });

  it('returns empty array when universal data script is missing', () => {
    const slides = extractImagePostFromHtml('<html><body>no data</body></html>');
    expect(slides).toEqual([]);
  });

  it('returns empty array for malformed JSON', () => {
    const html = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{broken json}</script>';
    const slides = extractImagePostFromHtml(html);
    expect(slides).toEqual([]);
  });

  it('skips images without urlList', () => {
    const html = makePage({
      imagePost: {
        images: [
          { imageURL: { urlList: ['https://cdn.example.com/slide1.jpeg'] } },
          { imageURL: {} },
          { imageURL: { urlList: ['https://cdn.example.com/slide3.jpeg'] } },
        ],
      },
    });
    const slides = extractImagePostFromHtml(html);
    expect(slides).toHaveLength(2);
    expect(slides[0].url).toBe('https://cdn.example.com/slide1.jpeg');
    expect(slides[1].url).toBe('https://cdn.example.com/slide3.jpeg');
  });
});

describe('extractMusicDurationFromHtml', () => {
  it('extracts music duration', () => {
    const html = makePage({
      imagePost: { images: [] },
      music: { duration: 22 },
      video: { duration: 0 },
    });
    expect(extractMusicDurationFromHtml(html)).toBe(22);
  });

  it('falls back to video duration when music duration is missing', () => {
    const html = makePage({
      video: { duration: 15 },
    });
    expect(extractMusicDurationFromHtml(html)).toBe(15);
  });

  it('returns undefined when no duration data exists', () => {
    const html = makePage({ imagePost: { images: [] } });
    expect(extractMusicDurationFromHtml(html)).toBeUndefined();
  });

  it('returns undefined for malformed HTML', () => {
    expect(extractMusicDurationFromHtml('<html>nope</html>')).toBeUndefined();
  });
});

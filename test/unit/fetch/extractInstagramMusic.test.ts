import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractMusicFromDir,
  extractMusicFromHtml,
  extractMusicFromJson,
} from '../../../src/fetch/extractInstagramMusic.js';

function dataSjsBlob(json: unknown): string {
  return `<script type="application/json" data-sjs>${JSON.stringify(json)}</script>`;
}

describe('extractMusicFromHtml', () => {
  it('extracts url and duration from music_asset with duration_ms', () => {
    const html = dataSjsBlob({
      music_asset: {
        download_url: 'https://cdn.example.com/audio.mp3',
        duration_ms: 30000,
      },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/audio.mp3');
    expect(music.duration).toBe(30);
  });

  it('extracts audio start time from audio_asset_start_time_in_ms', () => {
    const html = dataSjsBlob({
      music_asset_info: {
        progressive_download_url: 'https://cdn.example.com/track.m4a',
        audio_asset_start_time_in_ms: 28837,
        duration_in_ms: 160000,
      },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/track.m4a');
    expect(music.startTimeMs).toBe(28837);
    expect(music.duration).toBe(160);
  });

  it('extracts from nested clips_music structure', () => {
    const html = dataSjsBlob({
      clips_music: {
        music_asset: {
          progressive_download_url: 'https://cdn.example.com/clip.m4a',
          duration: 22,
        },
      },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/clip.m4a');
    expect(music.duration).toBe(22);
  });

  it('extracts url from uri key under audio_asset', () => {
    const html = dataSjsBlob({
      audio_asset: { uri: 'https://cdn.example.com/audio.mp4' },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/audio.mp4');
  });

  it('extracts duration in seconds from a bare duration key', () => {
    const html = dataSjsBlob({
      dashboard_music: { duration: 15.5 },
    });
    const music = extractMusicFromHtml(html);
    expect(music.duration).toBe(15.5);
  });

  it('treats a large bare duration value as milliseconds', () => {
    const html = dataSjsBlob({
      music_metadata: { duration: 45000 },
    });
    const music = extractMusicFromHtml(html);
    expect(music.duration).toBe(45);
  });

  it('extracts url from a string value under a music key', () => {
    const html = dataSjsBlob({
      audio_asset_identifier: 'https://cdn.example.com/track.mp3',
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/track.mp3');
  });

  it('does not mistake an artwork_url for the audio url', () => {
    const html = dataSjsBlob({
      music_asset: {
        artwork_url: 'https://cdn.example.com/cover.jpg',
        download_url: 'https://cdn.example.com/audio.mp3',
      },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/audio.mp3');
  });

  it('does not pick a url from a nested artwork object over download_url', () => {
    const html = dataSjsBlob({
      music_asset: {
        artwork: { url: 'https://cdn.example.com/cover.jpg' },
        download_url: 'https://cdn.example.com/audio.mp3',
      },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/audio.mp3');
  });

  it('does not recurse into cover or thumbnail subtrees for urls', () => {
    const html = dataSjsBlob({
      clips_music: {
        cover: { url: 'https://cdn.example.com/cover.jpg' },
        uri: 'https://cdn.example.com/audio.m4a',
      },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/audio.m4a');
  });

  it('matches musicInfo and musicManifest (case-insensitive key names)', () => {
    const html = dataSjsBlob({
      musicInfo: { url: 'https://cdn.example.com/info.mp3' },
      musicManifest: { duration: 9 },
    });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/info.mp3');
    expect(music.duration).toBe(9);
  });

  it('returns empty object when no music data is present', () => {
    const html = dataSjsBlob({ user: { posts: [{ id: 'abc' }] } });
    expect(extractMusicFromHtml(html)).toEqual({});
  });

  it('returns empty object when data-sjs script is missing', () => {
    expect(extractMusicFromHtml('<html>no scripts</html>')).toEqual({});
  });

  it('skips malformed data-sjs JSON and continues to the next blob', () => {
    const html =
      '<script type="application/json" data-sjs>{broken json}</script>' +
      dataSjsBlob({ music_asset: { url: 'https://cdn.example.com/x.mp3' } });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/x.mp3');
  });

  it('accumulates url and duration from separate blobs', () => {
    const html =
      dataSjsBlob({ music_asset: { download_url: 'https://cdn.example.com/a.mp3' } }) +
      dataSjsBlob({ clips_music: { duration: 12 } });
    const music = extractMusicFromHtml(html);
    expect(music.url).toBe('https://cdn.example.com/a.mp3');
    expect(music.duration).toBe(12);
  });
});

describe('extractMusicFromJson', () => {
  it('extracts url, duration, and start time from a raw JSON object', () => {
    const music = extractMusicFromJson({
      music_asset_info: {
        progressive_download_url: 'https://cdn.example.com/track.m4a',
        duration_in_ms: 160000,
        audio_asset_start_time_in_ms: 28837,
      },
    });
    expect(music.url).toBe('https://cdn.example.com/track.m4a');
    expect(music.duration).toBe(160);
    expect(music.startTimeMs).toBe(28837);
  });

  it('returns empty object when no music data is present', () => {
    expect(extractMusicFromJson({ user: { posts: [{ id: 'abc' }] } })).toEqual({});
  });
});

describe('extractMusicFromDir', () => {
  it('reads .dump files and extracts music', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-'));
    writeFileSync(
      join(dir, 'page.dump'),
      dataSjsBlob({
        music_asset: {
          download_url: 'https://cdn.example.com/audio.mp3',
          duration_ms: 10000,
        },
      }),
    );
    const music = extractMusicFromDir(dir);
    expect(music.url).toBe('https://cdn.example.com/audio.mp3');
    expect(music.duration).toBe(10);
  });

  it('extracts music from raw JSON .dump files (Instagram API responses)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-json-'));
    writeFileSync(
      join(dir, 'post.dump'),
      JSON.stringify({
        items: [
          {
            music_asset_info: {
              progressive_download_url: 'https://cdn.example.com/track.m4a',
              duration_in_ms: 160000,
            },
          },
        ],
      }),
    );
    const music = extractMusicFromDir(dir);
    expect(music.url).toBe('https://cdn.example.com/track.m4a');
    expect(music.duration).toBe(160);
  });

  it('falls back to HTML parsing when JSON parse fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-fallback-'));
    writeFileSync(
      join(dir, 'page.dump'),
      `{not valid json${dataSjsBlob({ music_asset: { url: 'https://cdn.example.com/x.mp3' } })}`,
    );
    const music = extractMusicFromDir(dir);
    expect(music.url).toBe('https://cdn.example.com/x.mp3');
  });

  it('ignores non-.dump files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-non-'));
    writeFileSync(
      join(dir, 'page.html'),
      dataSjsBlob({ music_asset: { download_url: 'https://cdn.example.com/audio.mp3' } }),
    );
    expect(extractMusicFromDir(dir)).toEqual({});
  });

  it('returns empty object when directory has no .dump files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-empty-'));
    expect(extractMusicFromDir(dir)).toEqual({});
  });

  it('returns empty object when directory does not exist', () => {
    expect(extractMusicFromDir('/nonexistent/path/xyz-123')).toEqual({});
  });

  it('accumulates url and duration across multiple .dump files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-multi-'));
    writeFileSync(join(dir, 'a.dump'), dataSjsBlob({ music_asset: { download_url: 'u' } }));
    writeFileSync(join(dir, 'b.dump'), dataSjsBlob({ clips_music: { duration: 7 } }));
    const music = extractMusicFromDir(dir);
    expect(music.url).toBe('u');
    expect(music.duration).toBe(7);
  });

  it('accumulates url from one .dump and startTimeMs/duration from another', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ig-music-split-'));
    writeFileSync(
      join(dir, 'url.dump'),
      dataSjsBlob({ music_asset: { download_url: 'https://cdn.example.com/split.m4a' } }),
    );
    writeFileSync(
      join(dir, 'timing.dump'),
      dataSjsBlob({
        music_asset_info: {
          audio_asset_start_time_in_ms: 28837,
          duration_in_ms: 160000,
        },
      }),
    );
    const music = extractMusicFromDir(dir);
    expect(music.url).toBe('https://cdn.example.com/split.m4a');
    expect(music.startTimeMs).toBe(28837);
    expect(music.duration).toBe(160);
  });
});

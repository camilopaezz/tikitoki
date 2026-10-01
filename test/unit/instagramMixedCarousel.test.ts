import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../src/config/index.js';
import { createPipeline } from '../../src/pipeline.js';
import { perJobDir } from '../../src/util/tmp.js';

vi.mock('../../src/process/ytDlp.js', () => ({
  runYtDlp: vi.fn(async (_args: string[], opts: { cwd: string }) => {
    writeFileSync(
      join(opts.cwd, 'post.dump'),
      JSON.stringify({
        items: [
          {
            carousel_media: [
              { id: 'first', image_versions2: { candidates: [{ url: 'https://cdn/first.jpg' }] } },
              {
                id: 'video',
                video_versions: [{ url: 'https://cdn/video.mp4', width: 1080, height: 1920 }],
                image_versions2: { candidates: [{ url: 'https://cdn/cover.jpg' }] },
              },
              { id: 'last', image_versions2: { candidates: [{ url: 'https://cdn/last.jpg' }] } },
            ],
          },
        ],
      }),
    );
    return { stdout: '', stderr: '', exitCode: 0 };
  }),
}));

const job = {
  jobId: 'mixed-carousel-regression',
  userId: 1,
  url: 'https://www.instagram.com/p/mixed/',
  mode: 'passthrough' as const,
};
const config: Config = {
  botToken: 'unused',
  concurrency: 2,
  cooldownSeconds: 30,
  hourlyCap: 60,
  targetSizeMb: 45,
  crossfadeSeconds: 0.4,
  silentSlideSeconds: 3,
};

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(perJobDir(job.jobId), { recursive: true, force: true });
});

describe('Instagram mixed carousel download', () => {
  it('downloads photos and the actual video from page data in their original order', async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(url));
    vi.stubGlobal('fetch', fetchMock);
    const stages: string[] = [];
    const result = await createPipeline({ config })(job, async (stage) => {
      stages.push(stage);
    });
    expect(result.kind).toBe('album');
    expect(result.media?.map((item) => item.type)).toEqual(['photo', 'video', 'photo']);
    expect(result.media?.map((item) => readFileSync(item.path, 'utf8'))).toEqual([
      'https://cdn/first.jpg',
      'https://cdn/video.mp4',
      'https://cdn/last.jpg',
    ]);
    expect(stages).toEqual(['Fetching', 'Uploading']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(call).toEqual([
        expect.any(String),
        expect.objectContaining({ headers: { Referer: 'https://www.instagram.com/' } }),
      ]);
    }
  });
});

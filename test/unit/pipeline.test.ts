import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveTikTokUrl = vi.fn();
const dumpJson = vi.fn();
const downloadSlideshow = vi.fn();
const downloadVideo = vi.fn();
const renderSlideshow = vi.fn();

vi.mock('../../src/fetch/resolveUrl.js', () => ({
  resolveTikTokUrl: (...args: unknown[]) => resolveTikTokUrl(...args),
  // classify re-exports nothing from here; rewriteToVideoUrl unused by pipeline.
}));
vi.mock('../../src/fetch/dumpJson.js', () => ({
  dumpJson: (...args: unknown[]) => dumpJson(...args),
}));
vi.mock('../../src/fetch/downloadSlideshow.js', () => ({
  downloadSlideshow: (...args: unknown[]) => downloadSlideshow(...args),
}));
vi.mock('../../src/fetch/downloadVideo.js', () => ({
  downloadVideo: (...args: unknown[]) => downloadVideo(...args),
}));
vi.mock('../../src/render/renderSlideshow.js', () => ({
  renderSlideshow: (...args: unknown[]) => renderSlideshow(...args),
}));

import type { Config } from '../../src/config/index.js';
import type { PostInfo } from '../../src/fetch/classify.js';
import { createPipeline } from '../../src/pipeline.js';

const config: Config = {
  botToken: 'test-token',
  cookiesPath: undefined,
  concurrency: 2,
  cooldownSeconds: 30,
  hourlyCap: 60,
  targetSizeMb: 45,
  crossfadeSeconds: 0.4,
  silentSlideSeconds: 3,
};

function baseJob() {
  return { jobId: 'pipe-test', userId: 1, url: 'https://www.tiktok.com/@user/photo/123' };
}

describe('createPipeline', () => {
  beforeEach(() => {
    resolveTikTokUrl.mockReset();
    dumpJson.mockReset();
    downloadSlideshow.mockReset();
    downloadVideo.mockReset();
    renderSlideshow.mockReset();
  });

  it('runs the slideshow path: fetch -> download -> render -> upload', async () => {
    const job = baseJob();
    resolveTikTokUrl.mockResolvedValue({
      url: 'https://www.tiktok.com/@user/photo/123',
      isSlideshow: true,
    });
    const info: PostInfo = { album: true, duration: 9, thumbnails: [{ url: 'http://x/1' }] };
    dumpJson.mockResolvedValue(info);
    downloadSlideshow.mockResolvedValue({
      images: ['/tmp/a.jpg', '/tmp/b.jpg'],
      audio: '/tmp/audio.m4a',
      duration: 9,
    });
    renderSlideshow.mockResolvedValue({ outputPath: '/tmp/out.mp4' });

    const stages: string[] = [];
    const onStage = vi.fn(async (stage: string) => {
      stages.push(stage);
    });

    const runPipeline = createPipeline({ config });
    const result = await runPipeline(job, onStage);

    expect(stages).toEqual(['Fetching', 'Rendering', 'Uploading']);
    expect(result).toEqual({ outputPath: '/tmp/out.mp4' });

    expect(resolveTikTokUrl).toHaveBeenCalledWith(job.url, job.jobId);
    expect(dumpJson).toHaveBeenCalledWith(
      expect.objectContaining({ isSlideshow: true, url: job.url, jobId: job.jobId }),
    );
    expect(dumpJson.mock.calls[0][0].pagesDir).toBeTruthy();
    expect(downloadSlideshow).toHaveBeenCalledWith({
      info,
      outDir: expect.any(String),
      jobId: job.jobId,
    });
    expect(renderSlideshow).toHaveBeenCalledWith({
      jobId: job.jobId,
      images: ['/tmp/a.jpg', '/tmp/b.jpg'],
      audioPath: '/tmp/audio.m4a',
      audioDuration: 9,
      targetSizeMb: 45,
      crossfadeSeconds: 0.4,
      silentSlideSeconds: 3,
    });
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it('runs the video path: fetch -> download -> upload (skips Rendering)', async () => {
    const job = { ...baseJob(), jobId: 'pipe-test-video' };
    resolveTikTokUrl.mockResolvedValue({
      url: 'https://www.tiktok.com/@user/video/123',
      isSlideshow: false,
    });
    const info: PostInfo = { formats: [{ vcodec: 'h264', height: 1080, width: 1920 }] };
    dumpJson.mockResolvedValue(info);
    downloadVideo.mockResolvedValue('/tmp/video.mp4');

    const stages: string[] = [];
    const onStage = vi.fn(async (stage: string) => {
      stages.push(stage);
    });

    const runPipeline = createPipeline({ config });
    const result = await runPipeline(job, onStage);

    expect(stages).toEqual(['Fetching', 'Uploading']);
    expect(result).toEqual({ outputPath: '/tmp/video.mp4' });

    expect(resolveTikTokUrl).toHaveBeenCalledWith(job.url, job.jobId);
    expect(dumpJson).toHaveBeenCalledWith(
      expect.objectContaining({
        isSlideshow: false,
        url: 'https://www.tiktok.com/@user/video/123',
        jobId: job.jobId,
      }),
    );
    expect(dumpJson.mock.calls[0][0].pagesDir).toBeUndefined();
    expect(downloadVideo).toHaveBeenCalledWith({
      url: 'https://www.tiktok.com/@user/video/123',
      outDir: expect.any(String),
      cookiesPath: undefined,
      maxSizeMb: 45,
      jobId: job.jobId,
    });
    expect(downloadSlideshow).not.toHaveBeenCalled();
    expect(renderSlideshow).not.toHaveBeenCalled();
  });

  it('passes cookiesPath through to dumpJson and downloadVideo', async () => {
    const job = { ...baseJob(), jobId: 'pipe-test-cookies' };
    const withCookies: Config = { ...config, cookiesPath: '/data/cookies.txt' };
    resolveTikTokUrl.mockResolvedValue({ url: job.url, isSlideshow: false });
    dumpJson.mockResolvedValue({ formats: [{ vcodec: 'h264', height: 720 }] });
    downloadVideo.mockResolvedValue('/tmp/video.mp4');

    const onStage = vi.fn().mockResolvedValue(undefined);
    const runPipeline = createPipeline({ config: withCookies });
    await runPipeline(job, onStage);

    expect(dumpJson).toHaveBeenCalledWith(
      expect.objectContaining({ cookiesPath: '/data/cookies.txt' }),
    );
    expect(downloadVideo).toHaveBeenCalledWith(
      expect.objectContaining({ cookiesPath: '/data/cookies.txt' }),
    );
  });

  it('propagates errors from downloadVideo without entering Rendering', async () => {
    const job = { ...baseJob(), jobId: 'pipe-test-err' };
    resolveTikTokUrl.mockResolvedValue({ url: job.url, isSlideshow: false });
    dumpJson.mockResolvedValue({ formats: [{ vcodec: 'h264', height: 720 }] });
    downloadVideo.mockRejectedValue(new Error('yt-dlp exploded'));

    const stages: string[] = [];
    const onStage = vi.fn(async (stage: string) => {
      stages.push(stage);
    });

    const runPipeline = createPipeline({ config });
    await expect(runPipeline(job, onStage)).rejects.toThrow('yt-dlp exploded');
    expect(stages).toEqual(['Fetching']);
    expect(onStage).not.toHaveBeenCalledWith('Rendering');
    expect(onStage).not.toHaveBeenCalledWith('Uploading');
  });

  it('propagates errors from renderSlideshow after Rendering is announced', async () => {
    const job = { ...baseJob(), jobId: 'pipe-test-render-err' };
    resolveTikTokUrl.mockResolvedValue({ url: job.url, isSlideshow: true });
    dumpJson.mockResolvedValue({ album: true, thumbnails: [{ url: 'http://x/1' }] });
    downloadSlideshow.mockResolvedValue({ images: ['/tmp/a.jpg'], duration: 3 });
    renderSlideshow.mockRejectedValue(new Error('ffmpeg died'));

    const stages: string[] = [];
    const onStage = vi.fn(async (stage: string) => {
      stages.push(stage);
    });

    const runPipeline = createPipeline({ config });
    await expect(runPipeline(job, onStage)).rejects.toThrow('ffmpeg died');
    expect(stages).toEqual(['Fetching', 'Rendering']);
    expect(onStage).not.toHaveBeenCalledWith('Uploading');
  });
});

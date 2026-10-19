import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { HttpError } from 'grammy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream: vi.fn(() => Readable.from(['x'])),
  };
});

import { sendMedia, sendPhoto, sendPhotos, sendVideo } from '../../../src/bot/send.js';

function fakeCtx() {
  return {
    replyWithVideo: vi.fn().mockResolvedValue(undefined),
    replyWithPhoto: vi.fn().mockResolvedValue(undefined),
    replyWithMediaGroup: vi.fn().mockResolvedValue(undefined),
    chat: { id: 1 },
    api: { editMessageText: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('sendVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  it('stops after one upload retry and leaves the error for the job handler', async () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    ctx.replyWithVideo.mockRejectedValue(
      new HttpError('Network request failed', new Error('ETIMEDOUT')),
    );
    const result = sendVideo(ctx as never, 99, '/tmp/out.mp4').catch((err) => err);
    await vi.runAllTimersAsync();
    expect(await result).toBeInstanceOf(HttpError);
    expect(ctx.replyWithVideo).toHaveBeenCalledTimes(2);
    expect(ctx.api.editMessageText).not.toHaveBeenCalled();
  });

  it('retries a network timeout with a fresh input stream', async () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    ctx.replyWithVideo.mockRejectedValueOnce(
      new HttpError('Network request failed', new Error('ETIMEDOUT')),
    );
    const result = sendVideo(ctx as never, 99, '/tmp/out.mp4');
    const assertion = expect(result).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    await assertion;
    expect(ctx.replyWithVideo).toHaveBeenCalledTimes(2);
    expect(createReadStream).toHaveBeenCalledTimes(2);
    expect(ctx.replyWithVideo.mock.calls[0][0]).not.toBe(ctx.replyWithVideo.mock.calls[1][0]);
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(1, 99, 'Done!');
  });

  it('does not fail delivery or send the video again when the Done edit fails', async () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    ctx.api.editMessageText.mockRejectedValue(
      new HttpError('Network request failed', new Error('ETIMEDOUT')),
    );
    const result = sendVideo(ctx as never, 99, '/tmp/out.mp4');
    const assertion = expect(result).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    await assertion;
    expect(ctx.replyWithVideo).toHaveBeenCalledTimes(1);
    expect(ctx.api.editMessageText).toHaveBeenCalledTimes(2);
  });

  it('replies with a video and marks the placeholder done', async () => {
    const ctx = fakeCtx();
    await sendVideo(ctx as never, 99, '/tmp/out.mp4');
    expect(ctx.replyWithVideo).toHaveBeenCalledOnce();
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(1, 99, 'Done!');
  });
});

describe('sendPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with a photo and marks the placeholder done', async () => {
    const ctx = fakeCtx();
    await sendPhoto(ctx as never, 99, '/tmp/pic.jpg');
    expect(ctx.replyWithPhoto).toHaveBeenCalledOnce();
    expect(ctx.replyWithVideo).not.toHaveBeenCalled();
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(1, 99, 'Done!');
  });
});

describe('sendPhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a single path as a photo', async () => {
    const ctx = fakeCtx();
    await sendPhotos(ctx as never, 99, ['/tmp/pic.jpg']);
    expect(ctx.replyWithPhoto).toHaveBeenCalledOnce();
    expect(ctx.replyWithMediaGroup).not.toHaveBeenCalled();
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(1, 99, 'Done!');
  });

  it('sends multiple paths as a media group', async () => {
    const ctx = fakeCtx();
    await sendPhotos(ctx as never, 99, ['/tmp/a.jpg', '/tmp/b.jpg']);
    expect(ctx.replyWithMediaGroup).toHaveBeenCalledOnce();
    expect(ctx.replyWithPhoto).not.toHaveBeenCalled();
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(1, 99, 'Done!');
  });

  it('chunks albums of more than 10 photos', async () => {
    const ctx = fakeCtx();
    const paths = Array.from({ length: 12 }, (_, i) => `/tmp/${i}.jpg`);
    await sendPhotos(ctx as never, 99, paths);
    expect(ctx.replyWithMediaGroup).toHaveBeenCalledTimes(2);
    const first = ctx.replyWithMediaGroup.mock.calls[0][0] as unknown[];
    const second = ctx.replyWithMediaGroup.mock.calls[1][0] as unknown[];
    expect(first).toHaveLength(10);
    expect(second).toHaveLength(2);
  });

  it('does not send a 1-item media group for an 11-photo album', async () => {
    const ctx = fakeCtx();
    const paths = Array.from({ length: 11 }, (_, i) => `/tmp/${i}.jpg`);
    await sendPhotos(ctx as never, 99, paths);
    expect(ctx.replyWithMediaGroup).toHaveBeenCalledTimes(1);
    expect(ctx.replyWithPhoto).toHaveBeenCalledOnce();
    const first = ctx.replyWithMediaGroup.mock.calls[0][0] as unknown[];
    expect(first).toHaveLength(10);
  });
});

describe('sendMedia', () => {
  afterEach(() => vi.useRealTimers());

  it('retries only the failed album chunk rather than resending completed chunks', async () => {
    vi.useFakeTimers();
    const ctx = fakeCtx();
    ctx.replyWithMediaGroup
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new HttpError('Network request failed', new Error('ECONNRESET')))
      .mockResolvedValueOnce(undefined);
    const result = sendMedia(
      ctx as never,
      99,
      Array.from({ length: 12 }, (_, i) => ({ type: 'photo' as const, path: `/tmp/${i}.jpg` })),
    );
    await vi.runAllTimersAsync();
    await result;
    expect(ctx.replyWithMediaGroup.mock.calls.map(([items]) => items.length)).toEqual([10, 2, 2]);
    expect(ctx.replyWithMediaGroup.mock.calls[1][0][0].media).not.toBe(
      ctx.replyWithMediaGroup.mock.calls[2][0][0].media,
    );
  });
  it('sends mixed photos and videos in order', async () => {
    const ctx = fakeCtx();
    await sendMedia(ctx as never, 99, [
      { type: 'photo', path: '/tmp/a.jpg' },
      { type: 'video', path: '/tmp/b.mp4' },
      { type: 'photo', path: '/tmp/c.jpg' },
    ]);
    expect(
      ctx.replyWithMediaGroup.mock.calls[0][0].map((item: { type: string }) => item.type),
    ).toEqual(['photo', 'video', 'photo']);
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(1, 99, 'Done!');
  });

  it('sends a trailing video individually after a full album', async () => {
    const ctx = fakeCtx();
    await sendMedia(ctx as never, 99, [
      ...Array.from({ length: 10 }, (_, i) => ({ type: 'photo' as const, path: `/tmp/${i}.jpg` })),
      { type: 'video', path: '/tmp/last.mp4' },
    ]);
    expect(ctx.replyWithMediaGroup.mock.calls[0][0]).toHaveLength(10);
    expect(ctx.replyWithVideo).toHaveBeenCalledOnce();
    expect(ctx.replyWithPhoto).not.toHaveBeenCalled();
  });

  it('does not mark a failed upload as done', async () => {
    const ctx = fakeCtx();
    ctx.replyWithMediaGroup.mockRejectedValue(new Error('upload failed'));
    await expect(
      sendMedia(ctx as never, 99, [
        { type: 'photo', path: '/tmp/a.jpg' },
        { type: 'video', path: '/tmp/b.mp4' },
      ]),
    ).rejects.toThrow('upload failed');
    expect(ctx.api.editMessageText).not.toHaveBeenCalled();
  });
});

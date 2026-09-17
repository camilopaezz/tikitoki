import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    createReadStream: vi.fn(() => Readable.from(['x'])),
  };
});

import { sendPhoto, sendPhotos, sendVideo } from '../../../src/bot/send.js';

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

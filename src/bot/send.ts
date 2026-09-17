import { createReadStream } from 'node:fs';
import type { Context } from 'grammy';
import { InputFile } from 'grammy';

const TELEGRAM_ALBUM_LIMIT = 10;

export async function sendVideo(ctx: Context, placeholderMessageId: number, videoPath: string) {
  await ctx.replyWithVideo(new InputFile(createReadStream(videoPath)));
  await ctx.api.editMessageText(ctx.chat?.id ?? 0, placeholderMessageId, 'Done!');
}

export async function sendPhoto(ctx: Context, placeholderMessageId: number, photoPath: string) {
  await ctx.replyWithPhoto(new InputFile(createReadStream(photoPath)));
  await ctx.api.editMessageText(ctx.chat?.id ?? 0, placeholderMessageId, 'Done!');
}

export async function sendPhotos(ctx: Context, placeholderMessageId: number, photoPaths: string[]) {
  if (photoPaths.length === 0) {
    throw new Error('Cannot send an empty photo list');
  }
  if (photoPaths.length === 1) {
    await sendPhoto(ctx, placeholderMessageId, photoPaths[0]);
    return;
  }
  // Telegram media groups require 2–10 items. A trailing remainder of 1 is
  // sent as a single photo so an 11-image carousel does not end with a 400.
  let i = 0;
  while (i < photoPaths.length) {
    const remaining = photoPaths.length - i;
    if (remaining === 1) {
      await ctx.replyWithPhoto(new InputFile(createReadStream(photoPaths[i])));
      break;
    }
    const chunkSize = Math.min(TELEGRAM_ALBUM_LIMIT, remaining);
    const chunk = photoPaths.slice(i, i + chunkSize);
    await ctx.replyWithMediaGroup(
      chunk.map((path) => ({
        type: 'photo' as const,
        media: new InputFile(createReadStream(path)),
      })),
    );
    i += chunkSize;
  }
  await ctx.api.editMessageText(ctx.chat?.id ?? 0, placeholderMessageId, 'Done!');
}

import { createReadStream } from 'node:fs';
import type { Context } from 'grammy';
import { InputFile } from 'grammy';
import type { DownloadedMedia } from '../job/types.js';

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
  await sendMedia(
    ctx,
    placeholderMessageId,
    photoPaths.map((path) => ({ type: 'photo', path })),
  );
}

export async function sendMedia(
  ctx: Context,
  placeholderMessageId: number,
  items: DownloadedMedia[],
) {
  if (items.length === 0) throw new Error('Cannot send an empty media list');
  for (let i = 0; i < items.length; i += TELEGRAM_ALBUM_LIMIT) {
    const chunk = items.slice(i, i + TELEGRAM_ALBUM_LIMIT);
    if (chunk.length === 1) {
      const item = chunk[0];
      const file = new InputFile(createReadStream(item.path));
      if (item.type === 'video') await ctx.replyWithVideo(file);
      else await ctx.replyWithPhoto(file);
    } else {
      await ctx.replyWithMediaGroup(
        chunk.map((item) => ({
          type: item.type,
          media: new InputFile(createReadStream(item.path)),
        })),
      );
    }
  }
  await ctx.api.editMessageText(ctx.chat?.id ?? 0, placeholderMessageId, 'Done!');
}

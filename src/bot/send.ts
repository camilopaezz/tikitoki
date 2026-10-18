import { createReadStream } from 'node:fs';
import type { Context } from 'grammy';
import { InputFile } from 'grammy';
import type { DownloadedMedia } from '../job/types.js';
import { createLogger } from '../util/logger.js';
import { withTelegramRetry } from './telegramRetry.js';

const TELEGRAM_ALBUM_LIMIT = 10;
const logger = createLogger();

export async function editPlaceholder(
  ctx: Context,
  messageId: number,
  text: string,
  chatId = ctx.chat?.id ?? 0,
) {
  try {
    await withTelegramRetry(() => ctx.api.editMessageText(chatId, messageId, text));
  } catch (err) {
    // A failed notification must not fail a completed delivery or stop polling.
    logger.warn(`Failed to update placeholder: ${(err as Error).message}`);
  }
}

export async function sendVideo(ctx: Context, placeholderMessageId: number, videoPath: string) {
  await withTelegramRetry(() => ctx.replyWithVideo(new InputFile(createReadStream(videoPath))));
  await editPlaceholder(ctx, placeholderMessageId, 'Done!');
}

export async function sendPhoto(ctx: Context, placeholderMessageId: number, photoPath: string) {
  await withTelegramRetry(() => ctx.replyWithPhoto(new InputFile(createReadStream(photoPath))));
  await editPlaceholder(ctx, placeholderMessageId, 'Done!');
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
      await withTelegramRetry(async () => {
        const file = new InputFile(createReadStream(item.path));
        if (item.type === 'video') await ctx.replyWithVideo(file);
        else await ctx.replyWithPhoto(file);
      });
    } else {
      await withTelegramRetry(() =>
        ctx.replyWithMediaGroup(
          chunk.map((item) => ({
            type: item.type,
            media: new InputFile(createReadStream(item.path)),
          })),
        ),
      );
    }
  }
  await editPlaceholder(ctx, placeholderMessageId, 'Done!');
}

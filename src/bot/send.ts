import { createReadStream } from 'node:fs';
import type { Context } from 'grammy';
import { InputFile } from 'grammy';

export async function sendVideo(ctx: Context, placeholderMessageId: number, videoPath: string) {
  await ctx.replyWithVideo(new InputFile(createReadStream(videoPath)));
  await ctx.api.editMessageText(ctx.chat?.id ?? 0, placeholderMessageId, 'Done!');
}

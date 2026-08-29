import type { Context } from 'grammy';

export const PROCESSING_MESSAGE = 'Processing…';

export async function sendPlaceholder(ctx: Context): Promise<number> {
  const message = await ctx.reply(PROCESSING_MESSAGE);
  return message.message_id;
}

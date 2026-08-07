import type { Context } from 'grammy';

export async function sendPlaceholder(ctx: Context): Promise<number> {
  const message = await ctx.reply('Processing…');
  return message.message_id;
}

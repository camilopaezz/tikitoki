import type { Context } from 'grammy';

export async function sendPlaceholder(ctx: Context): Promise<number> {
  const message = await ctx.reply('Processing your TikTok...');
  return message.message_id;
}

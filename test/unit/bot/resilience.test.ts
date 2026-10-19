import { BotError, type Context, HttpError } from 'grammy';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBot } from '../../../src/bot/index.js';

function makeBot() {
  return createBot({
    config: {
      botToken: '123456:fake-token',
      concurrency: 2,
      cooldownSeconds: 0,
      hourlyCap: 60,
      targetSizeMb: 45,
      crossfadeSeconds: 0.4,
      silentSlideSeconds: 3,
    },
    worker: vi.fn().mockRejectedValue(new Error('download failed')),
  }).bot;
}

describe('Telegram failure recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('contains a failed job notification instead of rejecting the update and stopping polling', async () => {
    vi.useFakeTimers();
    const bot = makeBot();
    bot.botInfo = {
      id: 123456,
      is_bot: true,
      first_name: 'Test',
      username: 'test_bot',
    } as typeof bot.botInfo;
    const user = { id: 42, is_bot: false, first_name: 'User' };
    const chat = { id: 42, type: 'private' as const, first_name: 'User' };
    let callback = '';
    let failedNotifications = 0;
    bot.api.config.use(async (_prev, method, payload) => {
      if (method === 'sendMessage') {
        const keyboard = payload.reply_markup as { inline_keyboard: { callback_data: string }[][] };
        callback = keyboard.inline_keyboard[0][0].callback_data;
        return { ok: true, result: { message_id: 99, date: 0, chat } } as never;
      }
      if (
        method === 'editMessageText' &&
        payload.text === 'Something went wrong while processing your post.'
      ) {
        failedNotifications++;
        throw new HttpError('Network request failed', new Error('ETIMEDOUT'));
      }
      return { ok: true, result: true } as never;
    });
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat,
        from: user,
        text: 'https://x.com/u/status/123',
      },
    });
    const result = bot
      .handleUpdate({
        update_id: 2,
        callback_query: {
          id: 'callback',
          from: user,
          chat_instance: 'test',
          data: callback,
          message: {
            message_id: 99,
            date: 0,
            chat,
            text: 'X post detected. Download the video, or render a feed card?',
          },
        },
      })
      .then(
        () => 'handled',
        () => 'rejected',
      );
    await vi.runAllTimersAsync();
    expect(await result).toBe('handled');
    expect(failedNotifications).toBe(2);
  });

  it('handles other middleware errors without stopping or logging nested request credentials', async () => {
    const bot = makeBot();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const nested = new Error(
      'request to https://api.telegram.org/bot123456:fake-secret/getUpdates failed',
    );
    const error = new BotError(new HttpError('Network request failed', nested), {
      update: { update_id: 1 },
    } as Context);
    const result = Promise.resolve().then(() => bot.errorHandler(error));
    await expect(result).resolves.toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).not.toContain('fake-secret');
  });
});

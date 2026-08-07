import { Bot, type Context, InlineKeyboard, type SessionFlavor, session } from 'grammy';
import type { Config } from '../config/index.js';
import { UserCooldown } from '../job/cooldown.js';
import { HourlyCap } from '../job/hourlyCap.js';
import { runJobLifecycle } from '../job/lifecycle.js';
import { createSlotPool } from '../job/slots.js';
import type { Job, JobMode, JobResult, Stage } from '../job/types.js';
import { createLogger } from '../util/logger.js';
import { isOperatorAlert, operatorAlertMessage, userFacingMessage } from './errors.js';
import {
  isTwitterUrl,
  parseIntake,
  USAGE_MESSAGE,
  X_CHOICE_EXPIRED_MESSAGE,
  X_CHOICE_MESSAGE,
  X_CHOICE_WRONG_USER_MESSAGE,
} from './intake.js';
import {
  encodeCallbackData,
  modeFromAction,
  PendingChoiceStore,
  parseCallbackData,
} from './pendingChoice.js';
import { sendPlaceholder } from './placeholder.js';
import { sendVideo } from './send.js';
import { createStageEditor, stageHandler } from './stageUpdates.js';

const logger = createLogger();

export interface BotDependencies {
  config: Config;
  worker: (job: Job, onStage: (stage: Stage) => Promise<void>) => Promise<JobResult>;
}

export interface BotInstance {
  bot: Bot<Context & SessionFlavor<Record<string, unknown>>>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createBot(deps: BotDependencies): BotInstance {
  const { config, worker } = deps;
  const bot = new Bot<Context & SessionFlavor<Record<string, unknown>>>(config.botToken);

  bot.use(session({ initial: () => ({}) }));

  const slotPool = createSlotPool(config.concurrency);
  const cooldown = new UserCooldown(config.cooldownSeconds);
  const hourlyCap = new HourlyCap(config.hourlyCap);
  const pendingChoices = new PendingChoiceStore();

  async function alertOperator(message: string) {
    if (!config.operatorChatId) return;
    try {
      await bot.api.sendMessage(config.operatorChatId, message);
    } catch (err) {
      logger.error(`Failed to alert operator: ${(err as Error).message}`);
    }
  }

  async function startJob(opts: {
    ctx: Context;
    userId: number;
    url: string;
    mode: JobMode;
    placeholderId: number;
  }) {
    const { ctx, userId, url, mode, placeholderId } = opts;

    await slotPool.add(async () => {
      try {
        await runJobLifecycle({
          userId,
          url,
          mode,
          worker,
          onStage: stageHandler(createStageEditor(ctx, placeholderId)),
          deliver: async (result) => {
            await sendVideo(ctx, placeholderId, result.outputPath);
          },
        });
      } catch (err) {
        logger.error(`Job error for user ${userId}: ${(err as Error).message}`, { userId });
        if (isOperatorAlert(err)) {
          const alert = operatorAlertMessage(err);
          logger.error(alert, { userId });
          await alertOperator(alert);
        }
        await ctx.api.editMessageText(ctx.chat?.id ?? 0, placeholderId, userFacingMessage(err));
      }
    });
  }

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const intake = parseIntake(ctx.message.text);

    if (!intake.url) {
      await ctx.reply(USAGE_MESSAGE);
      return;
    }

    // X/Twitter: offer download vs feed-card render; job starts on button press.
    if (isTwitterUrl(intake.url)) {
      const chatId = ctx.chat?.id;
      if (chatId == null) return;

      const token = pendingChoices.create({
        url: intake.url,
        userId,
        chatId,
      });

      const keyboard = new InlineKeyboard()
        .text('Download video', encodeCallbackData('dl', token))
        .text('Render post', encodeCallbackData('xr', token));

      await ctx.reply(X_CHOICE_MESSAGE, { reply_markup: keyboard });
      return;
    }

    try {
      cooldown.trySubmit(userId);
      hourlyCap.tryStart();
    } catch (err) {
      await ctx.reply(userFacingMessage(err));
      return;
    }

    const placeholderId = await sendPlaceholder(ctx);
    await startJob({
      ctx,
      userId,
      url: intake.url,
      mode: 'passthrough',
      placeholderId,
    });
  });

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const parsed = parseCallbackData(data);
    if (!parsed) {
      await ctx.answerCallbackQuery();
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.answerCallbackQuery();
      return;
    }

    const pending = pendingChoices.peek(parsed.token);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: X_CHOICE_EXPIRED_MESSAGE, show_alert: true });
      try {
        await ctx.editMessageText(X_CHOICE_EXPIRED_MESSAGE);
      } catch {
        // Message may already be gone or not editable.
      }
      return;
    }

    if (pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: X_CHOICE_WRONG_USER_MESSAGE, show_alert: true });
      return;
    }

    try {
      cooldown.trySubmit(userId);
      hourlyCap.tryStart();
    } catch (err) {
      await ctx.answerCallbackQuery({ text: userFacingMessage(err), show_alert: true });
      return;
    }

    // Consume only after auth + limits so a rate-limit failure keeps the choice.
    const claimed = pendingChoices.take(parsed.token);
    if (!claimed) {
      await ctx.answerCallbackQuery({ text: X_CHOICE_EXPIRED_MESSAGE, show_alert: true });
      return;
    }

    const mode = modeFromAction(parsed.action);
    await ctx.answerCallbackQuery();

    const placeholderId = ctx.callbackQuery.message?.message_id;
    const chatId = ctx.callbackQuery.message?.chat.id ?? claimed.chatId;

    if (placeholderId == null) {
      // Fallback: new placeholder if chooser message is missing.
      const id = await sendPlaceholder(ctx);
      await startJob({
        ctx,
        userId,
        url: claimed.url,
        mode,
        placeholderId: id,
      });
      return;
    }

    try {
      await ctx.api.editMessageText(chatId, placeholderId, 'Processing…');
    } catch (err) {
      logger.error(`Failed to edit choice message: ${(err as Error).message}`);
    }

    await startJob({
      ctx,
      userId,
      url: claimed.url,
      mode,
      placeholderId,
    });
  });

  return {
    bot,
    start: async () => {
      logger.info('Starting bot polling');
      await bot.start({ drop_pending_updates: true });
    },
    stop: async () => {
      logger.info('Stopping bot polling');
      await bot.stop();
      logger.info('Draining job slot queue');
      await slotPool.onIdle();
      logger.info('Slot queue drained');
    },
  };
}

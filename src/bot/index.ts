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
  CHOICE_EXPIRED_MESSAGE,
  CHOICE_WRONG_USER_MESSAGE,
  choiceForUrl,
  isChoicePromptMessage,
  parseIntake,
  USAGE_MESSAGE,
} from './intake.js';
import {
  encodeCallbackData,
  modeFromAction,
  PendingChoiceStore,
  parseCallbackData,
} from './pendingChoice.js';
import { PROCESSING_MESSAGE, sendPlaceholder } from './placeholder.js';
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
    chatId: number;
  }) {
    const { ctx, userId, url, mode, placeholderId, chatId } = opts;

    await slotPool.add(async () => {
      try {
        await runJobLifecycle({
          userId,
          url,
          mode,
          worker,
          onStage: stageHandler(createStageEditor(ctx, placeholderId, chatId)),
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
        await ctx.api.editMessageText(chatId, placeholderId, userFacingMessage(err));
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

    // Confirm via inline button so cooldown can toast remaining time on tap
    // without forcing the user to paste the URL again.
    const chatId = ctx.chat?.id;
    if (chatId == null) return;

    const token = pendingChoices.create({
      url: intake.url,
      userId,
      chatId,
    });
    const prompt = choiceForUrl(intake.url);
    const keyboard = new InlineKeyboard();
    for (const button of prompt.buttons) {
      keyboard.text(button.label, encodeCallbackData(button.action, token));
    }

    await ctx.reply(prompt.message, { reply_markup: keyboard });
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

    const callbackMsg = ctx.callbackQuery.message;
    const callbackText = callbackMsg && 'text' in callbackMsg ? callbackMsg.text : undefined;

    const pending = pendingChoices.peek(parsed.token);
    if (!pending) {
      await ctx.answerCallbackQuery({ text: CHOICE_EXPIRED_MESSAGE, show_alert: true });
      // Only rewrite unused confirm prompts. A leftover tap on a live
      // placeholder must not clobber Processing/stage/Done text.
      if (isChoicePromptMessage(callbackText)) {
        try {
          await ctx.editMessageText(CHOICE_EXPIRED_MESSAGE);
        } catch {
          // Message may already be gone or not editable.
        }
      }
      return;
    }

    if (pending.userId !== userId) {
      await ctx.answerCallbackQuery({ text: CHOICE_WRONG_USER_MESSAGE, show_alert: true });
      return;
    }

    const allowed = new Set(choiceForUrl(pending.url).buttons.map((b) => b.action));
    if (!allowed.has(parsed.action)) {
      await ctx.answerCallbackQuery();
      return;
    }

    try {
      cooldown.trySubmit(userId);
    } catch (err) {
      await ctx.answerCallbackQuery({ text: userFacingMessage(err), show_alert: true });
      return;
    }

    try {
      hourlyCap.tryStart();
    } catch (err) {
      cooldown.reset(userId);
      await ctx.answerCallbackQuery({ text: userFacingMessage(err), show_alert: true });
      return;
    }

    // Consume only after auth + limits so a cooldown miss keeps the button.
    const claimed = pendingChoices.take(parsed.token);
    if (!claimed) {
      await ctx.answerCallbackQuery({ text: CHOICE_EXPIRED_MESSAGE, show_alert: true });
      return;
    }

    const mode = modeFromAction(parsed.action);
    await ctx.answerCallbackQuery();

    const chatId = callbackMsg?.chat.id ?? claimed.chatId;
    let placeholderId = callbackMsg?.message_id;

    if (placeholderId != null) {
      try {
        await ctx.api.editMessageText(chatId, placeholderId, PROCESSING_MESSAGE, {
          reply_markup: { inline_keyboard: [] },
        });
      } catch (err) {
        logger.error(`Failed to edit choice message: ${(err as Error).message}`);
        placeholderId = undefined;
      }
    }

    if (placeholderId == null) {
      placeholderId = await sendPlaceholder(ctx);
    }

    await startJob({
      ctx,
      userId,
      url: claimed.url,
      mode,
      placeholderId,
      chatId,
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

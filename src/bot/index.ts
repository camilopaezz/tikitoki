import { Bot, type Context, type SessionFlavor, session } from 'grammy';
import type { Config } from '../config/index.js';
import { UserCooldown } from '../job/cooldown.js';
import { HourlyCap } from '../job/hourlyCap.js';
import { runJobLifecycle } from '../job/lifecycle.js';
import { createSlotPool } from '../job/slots.js';
import type { Job, JobResult, Stage } from '../job/types.js';
import { createLogger } from '../util/logger.js';
import { isOperatorAlert, operatorAlertMessage, userFacingMessage } from './errors.js';
import { extractPostUrl, USAGE_MESSAGE } from './intake.js';
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

  async function alertOperator(message: string) {
    if (!config.operatorChatId) return;
    try {
      await bot.api.sendMessage(config.operatorChatId, message);
    } catch (err) {
      logger.error(`Failed to alert operator: ${(err as Error).message}`);
    }
  }

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const url = extractPostUrl(ctx.message.text);
    if (!url) {
      await ctx.reply(USAGE_MESSAGE);
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

    await slotPool.add(async () => {
      try {
        await runJobLifecycle({
          userId,
          url,
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

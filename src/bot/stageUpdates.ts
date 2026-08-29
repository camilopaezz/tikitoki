import type { Context } from 'grammy';
import { createStageUpdater } from '../job/stages.js';
import type { Stage } from '../job/types.js';

export function createStageEditor(ctx: Context, messageId: number, chatId: number, jobId?: string) {
  return createStageUpdater(async (text: string) => {
    await ctx.api.editMessageText(chatId, messageId, text);
  }, jobId);
}

export type StageEditor = ReturnType<typeof createStageEditor>;

export function stageHandler(stageEditor: StageEditor) {
  return async (stage: Stage) => {
    await stageEditor.update(stage);
  };
}

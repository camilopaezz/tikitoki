import { createLogger } from '../util/logger.js';
import type { Stage } from './types.js';

const EDIT_INTERVAL_MS = 1000;

export interface StageUpdater {
  update(stage: Stage): Promise<void>;
}

export function createStageUpdater(
  edit: (text: string) => Promise<void>,
  jobId?: string,
): StageUpdater {
  const log = jobId ? createLogger({ jobId }) : createLogger();
  let lastStage: Stage | undefined;
  let lastEdit = 0;
  let pending: Stage | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    if (pending === undefined || pending === lastStage) return;
    const text = `Stage: ${pending}`;
    try {
      await edit(text);
      lastStage = pending;
      lastEdit = Date.now();
      log.info(`Updated placeholder to ${pending}`, { stage: pending });
    } catch (err) {
      log.warn(`Failed to update placeholder: ${(err as Error).message}`);
    } finally {
      pending = undefined;
      timer = undefined;
    }
  };

  return {
    async update(stage: Stage) {
      if (stage === lastStage) return;
      pending = stage;

      const now = Date.now();
      if (now - lastEdit >= EDIT_INTERVAL_MS) {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        await flush();
      } else if (!timer) {
        timer = setTimeout(flush, EDIT_INTERVAL_MS - (now - lastEdit));
      }
    },
  };
}

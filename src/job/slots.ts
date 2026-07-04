import PQueue from 'p-queue';

export function createSlotPool(concurrency: number): PQueue {
  return new PQueue({ concurrency });
}

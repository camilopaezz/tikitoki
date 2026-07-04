import { randomUUID } from 'node:crypto';
import { createLogger } from '../util/logger.js';
import { perJobDir, rmJobDir } from '../util/tmp.js';
import type { Job, JobId, JobResult, Stage, StageCallback } from './types.js';

export interface LifecycleOptions {
  userId: number;
  url: string;
  onStage?: StageCallback;
  worker: (job: Job, onStage: (stage: Stage) => Promise<void>) => Promise<JobResult>;
  deliver?: (result: JobResult, job: Job) => Promise<void>;
}

export interface LifecycleResult {
  jobId: JobId;
  result: JobResult;
}

export async function runJobLifecycle(opts: LifecycleOptions): Promise<LifecycleResult> {
  const jobId = randomUUID();
  const job: Job = { jobId, userId: opts.userId, url: opts.url };
  const log = createLogger({ jobId, userId: opts.userId });

  perJobDir(jobId);
  log.info('Job lifecycle started');

  const onStage = async (stage: Stage) => {
    log.info(`Stage: ${stage}`, { stage });
    await opts.onStage?.(stage);
  };

  try {
    const result = await opts.worker(job, onStage);
    await opts.deliver?.(result, job);
    log.info('Job completed successfully');
    return { jobId, result };
  } catch (err) {
    log.error(`Job failed: ${(err as Error).message}`);
    throw err;
  } finally {
    rmJobDir(jobId);
  }
}

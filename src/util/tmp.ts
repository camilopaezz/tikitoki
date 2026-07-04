import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger();
const BASE_DIR = join(tmpdir(), 'tikitoki');
const STARTUP_SWEEP_AGE_MS = 60 * 60 * 1000; // 1 hour

export function perJobDir(jobId: string): string {
  const dir = join(BASE_DIR, jobId);
  const imagesDir = join(dir, 'images');
  mkdirSync(imagesDir, { recursive: true });
  return dir;
}

export function rmJobDir(jobId: string): void {
  const dir = join(BASE_DIR, jobId);
  try {
    rmSync(dir, { recursive: true, force: true });
    logger.info(`Cleaned up temp dir for job ${jobId}`);
  } catch (err) {
    logger.warn(`Failed to clean up temp dir for job ${jobId}: ${(err as Error).message}`);
  }
}

export function startupSweep(): void {
  let removed = 0;
  try {
    const entries = readdirSync(BASE_DIR);
    const now = Date.now();
    for (const entry of entries) {
      const fullPath = join(BASE_DIR, entry);
      try {
        const stats = statSync(fullPath);
        if (stats.isDirectory() && now - stats.mtimeMs > STARTUP_SWEEP_AGE_MS) {
          rmSync(fullPath, { recursive: true, force: true });
          removed++;
        }
      } catch (err) {
        logger.warn(`Failed to stat/remove ${fullPath}: ${(err as Error).message}`);
      }
    }
  } catch {
    // Base dir may not exist yet; that's fine.
  }
  logger.info(`Startup sweep complete, removed ${removed} stale temp dirs`);
}

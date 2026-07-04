import { createBot } from './bot/index.js';
import { loadConfig, VERSION } from './config/index.js';
import { createPipeline } from './pipeline.js';
import { createLogger } from './util/logger.js';
import { startupSweep } from './util/tmp.js';

const logger = createLogger();

async function main() {
  logger.info(`tikitoki v${VERSION} starting`);
  const config = loadConfig();
  startupSweep();
  logger.info(`Config loaded (concurrency=${config.concurrency})`);

  const pipeline = createPipeline({ config });
  const { start, stop } = createBot({ config, worker: pipeline });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await start();
}

main().catch((err: unknown) => {
  logger.error(`Fatal startup error: ${(err as Error).message}`);
  process.exit(1);
});

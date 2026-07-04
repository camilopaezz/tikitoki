import { readFileSync } from 'node:fs';
import { z } from 'zod';

const configSchema = z.object({
  botToken: z.string().min(1, 'BOT_TOKEN is required'),
  cookiesPath: z.string().optional(),
  operatorChatId: z.coerce.number().int().optional(),
  concurrency: z.coerce.number().int().positive().default(2),
  cooldownSeconds: z.coerce.number().nonnegative().default(30),
  hourlyCap: z.coerce.number().int().nonnegative().default(60),
  targetSizeMb: z.coerce.number().positive().default(45),
  crossfadeSeconds: z.coerce.number().nonnegative().default(0.4),
  silentSlideSeconds: z.coerce.number().positive().default(3),
});

export type Config = z.infer<typeof configSchema>;

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function loadConfig(): Config {
  const parsed = configSchema.safeParse({
    botToken: process.env.BOT_TOKEN,
    cookiesPath: process.env.TIKTOKI_COOKIES_PATH,
    operatorChatId: process.env.OPERATOR_CHAT_ID,
    concurrency: process.env.CONCURRENCY,
    cooldownSeconds: process.env.COOLDOWN_SECONDS,
    hourlyCap: process.env.HOURLY_CAP,
    targetSizeMb: process.env.TARGET_SIZE_MB,
    crossfadeSeconds: process.env.CROSSFADE_SECONDS,
    silentSlideSeconds: process.env.SILENT_SLIDE_SECONDS,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration:\n${issues.join('\n')}`);
  }

  return parsed.data;
}

export const VERSION = readPackageVersion();

import { resolve } from 'node:path';

export function cookieArgs(cookiesPath?: string): string[] {
  return cookiesPath ? ['--cookies', resolve(cookiesPath)] : [];
}

export function cookieArgs(cookiesPath?: string): string[] {
  return cookiesPath ? ['--cookies', cookiesPath] : [];
}

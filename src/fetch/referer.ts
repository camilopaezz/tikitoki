/** TikTok rejects yt-dlp webpage requests that omit Referer (yt-dlp#17403). */
export const TIKTOK_REFERER = 'https://www.tiktok.com/';

export function isTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  } catch {
    return /(?:^|[/.])tiktok\.com(?:[/:?]|$)/i.test(url);
  }
}

/** Extra yt-dlp args required for TikTok extraction against current anti-bot. */
export function refererArgs(url: string): string[] {
  if (!isTikTokUrl(url)) return [];
  return ['--referer', TIKTOK_REFERER];
}

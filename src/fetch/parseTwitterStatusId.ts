/**
 * Extract the numeric status id from a Twitter/X status URL.
 * Accepts x.com / twitter.com paths like /user/status/123 or /i/status/123.
 */
export function parseTwitterStatusId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isTwitter =
      host === 'x.com' ||
      host === 'www.x.com' ||
      host === 'mobile.x.com' ||
      host === 'twitter.com' ||
      host.endsWith('.twitter.com');
    if (!isTwitter) return undefined;

    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

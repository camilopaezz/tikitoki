export function extractTikTokUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]+/i);
  return match?.[0];
}

export const USAGE_MESSAGE = "Send me a TikTok link and I'll download or render it as an MP4.";

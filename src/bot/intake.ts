export function extractPostUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s]*(?:tiktok|instagram)\.com\/[^\s]+/i);
  return match?.[0];
}

export const USAGE_MESSAGE =
  "Send me a TikTok or Instagram link and I'll download or render it as an MP4.";

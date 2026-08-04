export type JobMode = 'passthrough' | 'xrender';

export interface ParsedIntake {
  /** Absent when the message is not a usable job request. */
  url?: string;
  mode: JobMode;
  /**
   * True when the user invoked `/xrender` (with or without a URL).
   * Distinguishes "plain paste with no URL" from "command with no URL".
   */
  isXRenderCommand: boolean;
}

const POST_URL_RE = /https?:\/\/[^\s]*(?:tiktok\.com|instagram\.com|twitter\.com|x\.com)\/[^\s]+/i;

const XRENDER_CMD_RE = /^\/xrender(?:@\S+)?(?:\s+|$)/i;

const TWITTER_HOST_RE = /(?:twitter\.com|x\.com)/i;

export function extractPostUrl(text: string): string | undefined {
  const match = text.match(POST_URL_RE);
  return match?.[0];
}

export function isTwitterUrl(url: string): boolean {
  return TWITTER_HOST_RE.test(url);
}

/**
 * Parse a user message into job mode + optional post URL.
 * `/xrender` and `/xrender@BotName` enable chrome-render mode for Twitter/X.
 * Plain links stay passthrough.
 */
export function parseIntake(text: string): ParsedIntake {
  const trimmed = text.trim();
  const isXRenderCommand = XRENDER_CMD_RE.test(trimmed);
  const url = extractPostUrl(trimmed);
  return {
    url,
    mode: isXRenderCommand ? 'xrender' : 'passthrough',
    isXRenderCommand,
  };
}

export const USAGE_MESSAGE =
  "Send me a TikTok, Instagram, or Twitter/X link and I'll download or render it as an MP4. Use /xrender <Twitter/X video URL> for a feed-card render.";

export const XRENDER_USAGE_MESSAGE = 'Usage: /xrender <Twitter/X video post URL>';

export const XRENDER_TWITTER_ONLY_MESSAGE = '/xrender only works with Twitter/X links.';

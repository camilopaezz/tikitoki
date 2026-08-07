export interface ParsedIntake {
  /** Absent when the message is not a usable job request. */
  url?: string;
}

const POST_URL_RE = /https?:\/\/[^\s]*(?:tiktok\.com|instagram\.com|twitter\.com|x\.com)\/[^\s]+/i;

const TWITTER_HOST_RE = /(?:twitter\.com|x\.com)/i;

export function extractPostUrl(text: string): string | undefined {
  const match = text.match(POST_URL_RE);
  return match?.[0];
}

export function isTwitterUrl(url: string): boolean {
  return TWITTER_HOST_RE.test(url);
}

/**
 * Parse a user message into an optional post URL.
 * Mode (download vs feed-card render) is chosen via inline buttons for X links.
 */
export function parseIntake(text: string): ParsedIntake {
  const url = extractPostUrl(text.trim());
  return { url };
}

export const USAGE_MESSAGE =
  "Send me a TikTok, Instagram, or Twitter/X link. For X posts I'll ask whether to download the video or render a feed card.";

export const X_CHOICE_MESSAGE = 'X post detected. Download the video, or render a feed card?';

export const X_CHOICE_EXPIRED_MESSAGE = 'That choice expired. Send the X link again.';

export const X_CHOICE_WRONG_USER_MESSAGE = 'This choice is not for you.';

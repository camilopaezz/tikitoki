import { isTwitterUrl } from '../util/postHost.js';
import type { ChoiceAction } from './pendingChoice.js';

export { isTwitterUrl };

export interface ParsedIntake {
  /** Absent when the message is not a usable job request. */
  url?: string;
}

export interface ChoiceButton {
  action: ChoiceAction;
  label: string;
}

export interface ChoicePrompt {
  message: string;
  buttons: readonly ChoiceButton[];
}

const POST_URL_RE = /https?:\/\/[^\s]*(?:tiktok\.com|instagram\.com|twitter\.com|x\.com)\/[^\s]+/i;

export function extractPostUrl(text: string): string | undefined {
  const match = text.match(POST_URL_RE);
  return match?.[0];
}

/**
 * Parse a user message into an optional post URL.
 * Mode (download vs feed-card render) is confirmed via inline buttons.
 */
export function parseIntake(text: string): ParsedIntake {
  const url = extractPostUrl(text.trim());
  return { url };
}

/** Prompt + buttons shown after a URL paste; the job starts on button press. */
export function choiceForUrl(url: string): ChoicePrompt {
  if (isTwitterUrl(url)) {
    return {
      message: X_CHOICE_MESSAGE,
      buttons: [
        { action: 'dl', label: 'Download video' },
        { action: 'xr', label: 'Render post' },
      ],
    };
  }
  return {
    message: VIDEO_CHOICE_MESSAGE,
    buttons: [{ action: 'dl', label: 'Download video' }],
  };
}

export function isChoicePromptMessage(text: string | undefined): boolean {
  return text === VIDEO_CHOICE_MESSAGE || text === X_CHOICE_MESSAGE;
}

export const USAGE_MESSAGE =
  'Send me a TikTok, Instagram, or Twitter/X link, then tap Download. For X posts you can also render a feed card.';

export const VIDEO_CHOICE_MESSAGE = 'Download this video?';

export const X_CHOICE_MESSAGE = 'X post detected. Download the video, or render a feed card?';

export const CHOICE_EXPIRED_MESSAGE = 'That button expired. Send the link again.';

export const CHOICE_WRONG_USER_MESSAGE = 'This choice is not for you.';

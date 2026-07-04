import { AuthFailureError } from '../fetch/authFailure.js';
import { OversizedVideoError } from '../fetch/downloadVideo.js';
import { CooldownError } from '../job/cooldown.js';
import { HourlyCapError } from '../job/hourlyCap.js';

export function userFacingMessage(err: unknown): string {
  if (err instanceof CooldownError) return err.message;
  if (err instanceof HourlyCapError) return err.message;
  if (err instanceof OversizedVideoError) {
    return `That TikTok video is too large to send (${(err.sizeBytes / 1024 / 1024).toFixed(1)} MB).`;
  }
  if (err instanceof AuthFailureError) {
    return "Couldn't fetch that TikTok right now. Please try again later.";
  }
  return 'Something went wrong while processing your TikTok.';
}

export function isOperatorAlert(err: unknown): boolean {
  return err instanceof AuthFailureError;
}

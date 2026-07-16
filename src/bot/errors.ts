import { AuthFailureError } from '../fetch/authFailure.js';
import { OversizedVideoError } from '../fetch/downloadVideo.js';
import { MixedCarouselError, SingleImageError } from '../fetch/dumpInstagramCarousel.js';
import { CooldownError } from '../job/cooldown.js';
import { HourlyCapError } from '../job/hourlyCap.js';
export function userFacingMessage(err: unknown): string {
  if (err instanceof CooldownError) return err.message;
  if (err instanceof HourlyCapError) return err.message;
  if (err instanceof MixedCarouselError) {
    return "This post mixes photos and videos, which isn't supported yet. Send a photo-only carousel or a reel.";
  }
  if (err instanceof SingleImageError) {
    return "Single images aren't supported. Send a carousel or a reel.";
  }
  if (err instanceof OversizedVideoError) {
    return `That video is too large to send (${(err.sizeBytes / 1024 / 1024).toFixed(1)} MB).`;
  }
  if (err instanceof AuthFailureError) {
    return "Couldn't fetch that post right now. Please try again later.";
  }
  return 'Something went wrong while processing your post.';
}

export function isOperatorAlert(err: unknown): boolean {
  return err instanceof AuthFailureError;
}

export function operatorAlertMessage(err: unknown): string {
  if (err instanceof AuthFailureError) {
    const platform = err.platform ?? 'tiktok';
    const cookieFile = platform === 'instagram' ? 'Instagram cookies' : 'TikTok cookies';
    return `OPERATOR ALERT: ${platform} auth failure. ${cookieFile} may need to be re-exported. Re-export cookies and restart the bot.`;
  }
  return 'OPERATOR ALERT: Auth failure. Cookies may need to be re-exported. Re-export cookies and restart the bot.';
}

import { describe, expect, it } from 'vitest';
import {
  isOperatorAlert,
  operatorAlertMessage,
  userFacingMessage,
} from '../../../src/bot/errors.js';
import { AuthFailureError } from '../../../src/fetch/authFailure.js';
import { OversizedVideoError } from '../../../src/fetch/downloadVideo.js';
import { MixedCarouselError, SingleImageError } from '../../../src/fetch/dumpInstagramCarousel.js';
import { CooldownError } from '../../../src/job/cooldown.js';
import { HourlyCapError } from '../../../src/job/hourlyCap.js';

describe('userFacingMessage', () => {
  it('maps cooldown errors', () => {
    expect(userFacingMessage(new CooldownError(10))).toContain('wait');
  });

  it('maps hourly cap errors', () => {
    expect(userFacingMessage(new HourlyCapError())).toContain('busy');
  });

  it('maps auth failures', () => {
    expect(userFacingMessage(new AuthFailureError())).toContain('try again');
  });

  it('maps oversized video errors', () => {
    expect(
      userFacingMessage(new OversizedVideoError(60 * 1024 * 1024, 50 * 1024 * 1024)),
    ).toContain('too large');
  });

  it('falls back for unknown errors', () => {
    expect(userFacingMessage(new Error('boom'))).toContain('Something went wrong');
  });

  it('maps mixed carousel errors to the photo-only carousel or reel prompt', () => {
    expect(userFacingMessage(new MixedCarouselError())).toBe(
      "This post mixes photos and videos, which isn't supported yet. Send a photo-only carousel or a reel.",
    );
  });

  it('maps single image errors to the carousel or reel prompt', () => {
    expect(userFacingMessage(new SingleImageError())).toBe(
      "Single images aren't supported. Send a carousel or a reel.",
    );
  });

  it('does not leak platform names into the auth failure message', () => {
    expect(userFacingMessage(new AuthFailureError())).not.toMatch(/tiktok|instagram/i);
  });
});

describe('isOperatorAlert', () => {
  it('returns true for auth failures', () => {
    expect(isOperatorAlert(new AuthFailureError())).toBe(true);
  });

  it('returns false for mixed carousel errors', () => {
    expect(isOperatorAlert(new MixedCarouselError())).toBe(false);
  });

  it('returns false for single image errors', () => {
    expect(isOperatorAlert(new SingleImageError())).toBe(false);
  });

  it('returns false for other errors', () => {
    expect(isOperatorAlert(new Error('boom'))).toBe(false);
  });
});

describe('operatorAlertMessage', () => {
  it('mentions re-exporting cookies for auth failures', () => {
    expect(operatorAlertMessage(new AuthFailureError())).toMatch(/re-export cookies/i);
  });

  it('defaults to TikTok when no platform is specified', () => {
    expect(operatorAlertMessage(new AuthFailureError())).toMatch(/tiktok/i);
  });

  it('mentions Instagram for Instagram auth failures', () => {
    expect(operatorAlertMessage(new AuthFailureError(undefined, 'instagram'))).toMatch(
      /instagram/i,
    );
  });

  it('mentions TikTok for TikTok auth failures', () => {
    expect(operatorAlertMessage(new AuthFailureError(undefined, 'tiktok'))).toMatch(/tiktok/i);
  });
});

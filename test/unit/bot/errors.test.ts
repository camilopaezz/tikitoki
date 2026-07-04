import { describe, expect, it } from 'vitest';
import { isOperatorAlert, userFacingMessage } from '../../../src/bot/errors.js';
import { AuthFailureError } from '../../../src/fetch/authFailure.js';
import { OversizedVideoError } from '../../../src/fetch/downloadVideo.js';
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
});

describe('isOperatorAlert', () => {
  it('returns true for auth failures', () => {
    expect(isOperatorAlert(new AuthFailureError())).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isOperatorAlert(new Error('boom'))).toBe(false);
  });
});

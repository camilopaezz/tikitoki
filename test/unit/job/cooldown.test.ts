import { beforeEach, describe, expect, it } from 'vitest';
import { CooldownError, UserCooldown } from '../../../src/job/cooldown.js';

describe('UserCooldown', () => {
  let cooldown: UserCooldown;

  beforeEach(() => {
    cooldown = new UserCooldown(30);
  });

  it('allows the first submission', () => {
    expect(() => cooldown.trySubmit(1, 0)).not.toThrow();
  });

  it('rejects a submission within the cooldown window', () => {
    cooldown.trySubmit(1, 0);
    expect(() => cooldown.trySubmit(1, 1000)).toThrow(CooldownError);
  });

  it('allows a submission after the cooldown window', () => {
    cooldown.trySubmit(1, 0);
    expect(() => cooldown.trySubmit(1, 30_001)).not.toThrow();
  });

  it('tracks users independently', () => {
    cooldown.trySubmit(1, 0);
    expect(() => cooldown.trySubmit(2, 1000)).not.toThrow();
  });
});

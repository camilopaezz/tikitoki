export class CooldownError extends Error {
  constructor(secondsRemaining: number) {
    super(`Please wait ${Math.ceil(secondsRemaining)} seconds before sending another link.`);
    this.name = 'CooldownError';
  }
}

export class UserCooldown {
  private lastSubmitByUser = new Map<number, number>();

  constructor(private cooldownSeconds: number) {}

  trySubmit(userId: number, now = Date.now()): void {
    const last = this.lastSubmitByUser.get(userId);
    if (last !== undefined) {
      const elapsed = (now - last) / 1000;
      if (elapsed < this.cooldownSeconds) {
        throw new CooldownError(this.cooldownSeconds - elapsed);
      }
    }
    this.lastSubmitByUser.set(userId, now);
  }

  reset(userId: number): void {
    this.lastSubmitByUser.delete(userId);
  }
}

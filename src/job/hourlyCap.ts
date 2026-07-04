export class HourlyCapError extends Error {
  constructor() {
    super('The bot is busy right now. Please try again in a little while.');
    this.name = 'HourlyCapError';
  }
}

export class HourlyCap {
  private starts: number[] = [];

  constructor(
    private cap: number,
    private windowMs = 60 * 60 * 1000,
  ) {}

  tryStart(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    this.starts = this.starts.filter((t) => t > cutoff);
    if (this.starts.length >= this.cap) {
      throw new HourlyCapError();
    }
    this.starts.push(now);
  }

  count(now = Date.now()): number {
    const cutoff = now - this.windowMs;
    return this.starts.filter((t) => t > cutoff).length;
  }
}

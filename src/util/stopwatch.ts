/** Tiny wall-clock timer for stage profiling. */
export function createStopwatch() {
  const t0 = Date.now();
  let last = t0;
  const marks: Record<string, number> = {};

  return {
    /** Record ms since previous mark (or start). */
    lap(name: string): number {
      const now = Date.now();
      const ms = now - last;
      marks[name] = ms;
      last = now;
      return ms;
    },
    /** Total ms since stopwatch creation. */
    total(): number {
      return Date.now() - t0;
    },
    marks(): Readonly<Record<string, number>> {
      return marks;
    },
  };
}

export type Stopwatch = ReturnType<typeof createStopwatch>;

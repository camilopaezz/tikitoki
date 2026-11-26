export interface Timing {
  /** Length of each slide's input stream, crossfade overlap included. */
  perSlide: number;
  /** Effective crossfade (clamped to half a slide). */
  crossfade: number;
  /** Rendered video length: `n * perSlide - (n - 1) * crossfade`. */
  totalDuration: number;
  addSilentAudio: boolean;
}

/**
 * Slide timing for the xfade chain. Each crossfade overlaps two slides, so
 * with music the per-slide length is stretched by the overlap: the video then
 * ends with the audio instead of `(n - 1) * crossfade` early (which used to
 * cut the tail of the track via `-shortest`).
 */
export function computeTiming(
  slideCount: number,
  audioDuration: number | undefined,
  silentSlideSeconds: number,
  hasAudio: boolean = audioDuration !== undefined,
  crossfadeSeconds = 0,
): Timing {
  if (slideCount === 0) {
    throw new Error('Cannot compute timing for zero slides');
  }
  const n = slideCount;
  const xf = Math.max(0, crossfadeSeconds);

  if (audioDuration === undefined || audioDuration <= 0) {
    const perSlide = silentSlideSeconds;
    const crossfade = n > 1 ? Math.min(xf, perSlide / 2) : 0;
    return {
      perSlide,
      crossfade,
      totalDuration: n * perSlide - (n - 1) * crossfade,
      addSilentAudio: !hasAudio,
    };
  }

  if (n === 1) {
    return {
      perSlide: audioDuration,
      crossfade: 0,
      totalDuration: audioDuration,
      addSilentAudio: false,
    };
  }

  // Solve n*p - (n-1)*xf = A; if xf would exceed p/2, clamp to p/2 and re-solve.
  let perSlide = (audioDuration + (n - 1) * xf) / n;
  let crossfade = xf;
  if (crossfade > perSlide / 2) {
    perSlide = (2 * audioDuration) / (n + 1);
    crossfade = perSlide / 2;
  }
  return { perSlide, crossfade, totalDuration: audioDuration, addSilentAudio: false };
}

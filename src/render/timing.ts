export interface Timing {
  perSlide: number;
  totalDuration: number;
  addSilentAudio: boolean;
}

export function computeTiming(
  slideCount: number,
  audioDuration: number | undefined,
  silentSlideSeconds: number,
): Timing {
  if (slideCount === 0) {
    throw new Error('Cannot compute timing for zero slides');
  }

  if (audioDuration === undefined || audioDuration <= 0) {
    return {
      perSlide: silentSlideSeconds,
      totalDuration: slideCount * silentSlideSeconds,
      addSilentAudio: true,
    };
  }

  const perSlide = audioDuration / slideCount;
  return {
    perSlide,
    totalDuration: audioDuration,
    addSilentAudio: false,
  };
}

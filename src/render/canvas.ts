export interface Slide {
  path: string;
  width: number;
  height: number;
}

export interface Canvas {
  width: number;
  height: number;
}

export function pickCanvas(slides: Slide[]): Canvas {
  if (slides.length === 0) {
    throw new Error('Cannot pick canvas from empty slide list');
  }

  let largest = slides[0];
  let largestArea = largest.width * largest.height;

  for (const slide of slides.slice(1)) {
    const area = slide.width * slide.height;
    if (area > largestArea) {
      largest = slide;
      largestArea = area;
    }
  }

  return {
    width: largest.width % 2 === 0 ? largest.width : largest.width + 1,
    height: largest.height % 2 === 0 ? largest.height : largest.height + 1,
  };
}

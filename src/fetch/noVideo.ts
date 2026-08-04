export class NoVideoError extends Error {
  constructor(message = 'That post does not have a downloadable video.') {
    super(message);
    this.name = 'NoVideoError';
  }
}

const NO_VIDEO_PATTERNS = [
  /no video could be found in this tweet/i,
  /no video formats found/i,
  /there's no video in this tweet/i,
  /tweet does not contain a video/i,
];

export function detectNoVideo(stderr: string): boolean {
  return NO_VIDEO_PATTERNS.some((pattern) => pattern.test(stderr));
}

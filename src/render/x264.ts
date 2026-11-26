/**
 * libx264 presets shared by every encode. New features should use
 * DEFAULT_X264_PRESET unless they have a measured reason not to.
 */

/** About 2x faster than `medium` with no visible loss on bot-sized clips. */
export const DEFAULT_X264_PRESET = 'veryfast';

/**
 * Two-pass encodes that must fit a file-size budget, where quality per byte
 * matters more than speed (slideshows, oversized-video compression).
 */
export const QUALITY_X264_PRESET = 'medium';

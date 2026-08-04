/**
 * Truncate tweet text for feed-card chrome (~2–3 lines).
 * Prefers a word boundary when maxChars cuts mid-word.
 */
export function truncateTweetText(text: string, maxLines = 3, maxChars = 140): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const byLines = normalized.split(/\n+/).slice(0, maxLines).join('\n');
  let candidate = byLines.length <= maxChars ? byLines : byLines.slice(0, maxChars);

  if (candidate.length < normalized.length) {
    // Avoid ugly mid-word cuts when we sliced by chars.
    if (candidate.length === maxChars) {
      const lastSpace = candidate.lastIndexOf(' ');
      if (lastSpace > maxChars * 0.6) {
        candidate = candidate.slice(0, lastSpace);
      }
    }
    candidate = `${candidate.replace(/[….\s]+$/u, '')}…`;
  }

  return candidate;
}

/**
 * Apply Twitter display_text_range [start, end) on UTF-16 code units
 * (syndication ranges are UTF-16 indices, same as JS string indices for BMP).
 */
export function sliceDisplayText(
  text: string,
  range: readonly [number, number] | number[] | undefined,
): string {
  if (!text) return '';
  if (!range || range.length < 2) return text.trim();
  const start = Math.max(0, range[0] ?? 0);
  const end = Math.min(text.length, range[1] ?? text.length);
  if (end <= start) return '';
  return text.slice(start, end).trim();
}

/** Prefer higher-res avatar from twimg `_normal` / `_200x200` URLs. */
export function upscaleAvatarUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/_normal(\.[a-zA-Z0-9]+)?$/i, '_400x400$1')
    .replace(/_200x200(\.[a-zA-Z0-9]+)?$/i, '_400x400$1')
    .replace(/_mini(\.[a-zA-Z0-9]+)?$/i, '_400x400$1');
}

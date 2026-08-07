/** Twitter short links (media attachments / auto-appended). Never show in chrome. */
const TCO_URL_RE = /https?:\/\/t\.co\/[A-Za-z0-9]+/gi;

/**
 * Drop t.co URLs and tidy leftover whitespace. Media-only captions become "".
 */
export function stripTcoUrls(text: string): string {
  if (!text) return '';
  return text
    .replace(TCO_URL_RE, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Truncate tweet text for feed-card chrome (~2–3 lines).
 * Keeps hard line breaks **and blank lines** (paragraph gaps in X captions).
 * Collapses only horizontal whitespace / runs of empty lines.
 * Prefers a word boundary when maxChars cuts mid-word.
 */
export function truncateTweetText(text: string, maxLines = 3, maxChars = 140): string {
  const stripped = stripTcoUrls(text);
  if (!stripped) return '';

  // Split on single newlines so "" between paragraphs survives (X blank lines).
  const rawLines = stripped.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  // Drop leading/trailing empties; collapse consecutive blanks to one.
  const hardLines: string[] = [];
  for (const line of rawLines) {
    if (line === '') {
      if (hardLines.length > 0 && hardLines[hardLines.length - 1] !== '') {
        hardLines.push('');
      }
      continue;
    }
    hardLines.push(line);
  }
  while (hardLines.length && hardLines[hardLines.length - 1] === '') {
    hardLines.pop();
  }
  if (!hardLines.length) return '';

  const kept = hardLines.slice(0, maxLines);
  // Don't end a truncated slice on a blank line.
  while (kept.length && kept[kept.length - 1] === '') {
    kept.pop();
  }
  let candidate = kept.join('\n');
  const truncatedByLines = hardLines.length > maxLines;

  if (candidate.length > maxChars) {
    candidate = candidate.slice(0, maxChars);
    const lastSpace = candidate.lastIndexOf(' ');
    const lastNl = candidate.lastIndexOf('\n');
    const cut = Math.max(lastSpace, lastNl);
    if (cut > maxChars * 0.6) {
      candidate = candidate.slice(0, cut);
    }
    return `${candidate.replace(/[….\s]+$/u, '')}…`;
  }

  if (truncatedByLines) {
    return `${candidate.replace(/[….\s]+$/u, '')}…`;
  }

  return candidate;
}

/**
 * Apply Twitter display_text_range [start, end) on UTF-16 code units
 * (syndication ranges are UTF-16 indices, same as JS string indices for BMP).
 * Always strips residual t.co URLs (media links often leak past the range).
 */
export function sliceDisplayText(
  text: string,
  range: readonly [number, number] | number[] | undefined,
): string {
  if (!text) return '';
  let sliced: string;
  if (!range || range.length < 2) {
    sliced = text.trim();
  } else {
    const start = Math.max(0, range[0] ?? 0);
    const end = Math.min(text.length, range[1] ?? text.length);
    if (end <= start) return '';
    sliced = text.slice(start, end).trim();
  }
  return stripTcoUrls(sliced);
}

/** Prefer higher-res avatar from twimg `_normal` / `_200x200` URLs. */
export function upscaleAvatarUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/_normal(\.[a-zA-Z0-9]+)?$/i, '_400x400$1')
    .replace(/_200x200(\.[a-zA-Z0-9]+)?$/i, '_400x400$1')
    .replace(/_mini(\.[a-zA-Z0-9]+)?$/i, '_400x400$1');
}

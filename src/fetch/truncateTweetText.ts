/** Twitter short links (media attachments / auto-appended). Never show in chrome. */
const TCO_URL_RE = /https?:\/\/t\.co\/[A-Za-z0-9]+/gi;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode HTML entities that syndication/API text often embeds (`&gt;`, `&amp;`, `&#62;`).
 *
 * Must run **after** `display_text_range` slicing (ranges index the encoded string) and
 * **before** HTML escaping in chrome — otherwise `esc()` turns `&gt;` into `&amp;gt;`
 * and Chromium screenshots show the literal entity.
 *
 * `&amp;` is applied last so a single-encoded payload stays correct
 * (`&amp;gt;` → literal `&gt;`, not `>`).
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text;
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
      const key = body.toLowerCase();
      if (key[0] === '#') {
        const codePoint =
          key[1] === 'x' ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      if (key === 'amp') return match; // deferred — see second pass
      return NAMED_HTML_ENTITIES[key] ?? match;
    })
    .replace(/&amp;/gi, '&');
}

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
  // Decode first so maxChars counts visible glyphs (`&gt;` → `>`), not entity markup.
  const stripped = stripTcoUrls(decodeHtmlEntities(text));
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
  // Range indexes the encoded syndication string; decode only after slicing.
  return stripTcoUrls(decodeHtmlEntities(sliced));
}

/** Prefer higher-res avatar from twimg `_normal` / `_200x200` URLs. */
export function upscaleAvatarUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/_normal(\.[a-zA-Z0-9]+)?$/i, '_400x400$1')
    .replace(/_200x200(\.[a-zA-Z0-9]+)?$/i, '_400x400$1')
    .replace(/_mini(\.[a-zA-Z0-9]+)?$/i, '_400x400$1');
}

import { pathToFileURL } from 'node:url';
import type { XPostAssets } from '../../fetch/downloadXAssets.js';
import { truncateTweetText } from '../../fetch/truncateTweetText.js';
import { X_LAYOUT_CONSTANTS } from './layout.js';
import type { XPostLayout } from './types.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fileSrc(p: string | undefined): string | undefined {
  if (!p) return undefined;
  return pathToFileURL(p).href;
}

function avatarHtml(path: string | undefined, size: number, label: string): string {
  const src = fileSrc(path);
  if (src) {
    return `<img class="avatar" src="${esc(src)}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px" />`;
  }
  const initial = esc((label[0] ?? '?').toUpperCase());
  return `<div class="avatar placeholder" style="width:${size}px;height:${size}px">${initial}</div>`;
}

function badge(verified: boolean, size: number): string {
  if (!verified) return '';
  return `<svg class="badge" viewBox="0 0 22 22" width="${size}" height="${size}" aria-hidden="true"><path fill="#1e9cf1" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.971.854-1.245 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.878 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>`;
}

function mediaHoleHtml(slot: XPostLayout['mediaSlot']): string {
  return `<div class="media-wrap">
      <div class="media-hole" data-media-hole="1" data-w="${slot.w}" data-h="${slot.h}"></div>
      <div class="media-ring" aria-hidden="true"></div>
    </div>`;
}

/**
 * Build feed-card chrome as **document flow** (not absolute Y for the hole).
 *
 * Chromium wraps caption text for real; the green media hole sits after the
 * header in normal flow (or inside the quote card for `quote_of_video`).
 * `renderXPost` measures the hole from the PNG so ffmpeg overlay Y matches.
 */
export function buildChromeHtml(assets: XPostAssets, layout: XPostLayout): string {
  const { width, height } = layout.canvas;
  const outerText = truncateTweetText(
    assets.outer.text.displayText,
    X_LAYOUT_CONSTANTS.TEXT_MAX_LINES,
    X_LAYOUT_CONSTANTS.OUTER_TEXT_MAX_CHARS,
  );
  const slot = layout.mediaSlot;
  const padX = layout.padX;
  const colW = width - padX * 2;
  const {
    PAD_TOP,
    PAD_BOTTOM,
    AVATAR,
    HEADER_GAP,
    FONT_SIZE,
    LINE_HEIGHT,
    TEXT_MAX_LINES,
    TEXT_MARGIN_TOP,
    NAME_ROW_GAP,
    GAP_HEADER_MEDIA,
    GAP_MEDIA_QUOTE,
    MEDIA_BORDER,
    QUOTE_RADIUS,
    QUOTE_PAD,
    QUOTE_AVATAR,
    QUOTE_INNER_GAP,
    QUOTE_BORDER,
    QUOTE_SINGLE_IMG,
    QUOTE_IMG_GAP,
    BADGE,
  } = X_LAYOUT_CONSTANTS;
  const textColIndent = AVATAR + HEADER_GAP;
  const textColW = colW - textColIndent;
  const quoteImgCount = assets.quote?.images.length ?? 0;
  const singleQuoteImg = quoteImgCount === 1;
  const videoInsideQuote = assets.layoutKind === 'quote_of_video' && Boolean(assets.quote);
  const hole = mediaHoleHtml(slot);

  let quoteBlock = '';
  if (assets.quote) {
    const q = assets.quote;
    const qText = truncateTweetText(q.text.displayText, 3, 140);
    const head = `
        <div class="quote-head">
          ${avatarHtml(q.author.avatarPath, QUOTE_AVATAR, q.author.name)}
          <span class="name">${esc(q.author.name)}</span>
          ${badge(q.author.verified, BADGE)}
          <span class="handle">@${esc(q.author.handle)}</span>
        </div>`;
    const body = qText ? `<p class="qtext">${esc(qText)}</p>` : '';
    const nestedHole = videoInsideQuote ? hole : '';

    if (singleQuoteImg && !videoInsideQuote) {
      const src = fileSrc(q.images[0]?.path);
      const thumb = src
        ? `<img class="qimg qimg-single" src="${esc(src)}" alt="" />`
        : `<div class="qimg qimg-single ph"></div>`;
      quoteBlock = `
      <div class="quote quote-single" style="width:${textColW}px;margin-left:${textColIndent}px">
        ${head}
        <div class="quote-body">
          ${thumb}
          ${body}
        </div>
      </div>`;
    } else {
      const imgs =
        !videoInsideQuote && q.images.length > 1
          ? q.images
              .map((img) => {
                const src = fileSrc(img.path);
                return src
                  ? `<img class="qimg" src="${esc(src)}" alt="" />`
                  : `<div class="qimg ph"></div>`;
              })
              .join('')
          : '';
      quoteBlock = `
      <div class="quote" style="width:${textColW}px;margin-left:${textColIndent}px">
        ${head}
        ${body}
        ${imgs ? `<div class="qimgs">${imgs}</div>` : ''}
        ${nestedHole}
      </div>`;
    }
  }

  const outerHole = videoInsideQuote ? '' : hole;
  const qImgRows = quoteImgCount >= 3 ? '1fr 1fr' : '1fr';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${width}px;
    min-height: ${height}px;
    height: ${height}px;
    margin: 0;
    padding: 0;
    background: #000;
    color: #e6e9ea;
    font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  .card {
    width: ${width}px;
    min-height: ${height}px;
    background: #000;
    padding: ${PAD_TOP}px ${padX}px ${PAD_BOTTOM}px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .header {
    width: ${colW}px;
    display: flex;
    gap: ${HEADER_GAP}px;
    align-items: flex-start;
  }
  .avatar {
    border-radius: 999px;
    object-fit: cover;
    flex-shrink: 0;
    background: #333;
  }
  .avatar.placeholder {
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: ${FONT_SIZE}px; color: #71767a;
  }
  .main { flex: 1; min-width: 0; }
  .name-row {
    display: flex;
    align-items: center;
    gap: ${NAME_ROW_GAP}px;
    flex-wrap: nowrap;
    min-width: 0;
  }
  .name {
    font-weight: 700;
    font-size: ${FONT_SIZE}px;
    line-height: ${LINE_HEIGHT}px;
    color: #e6e9ea;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .handle {
    font-size: ${FONT_SIZE}px;
    line-height: ${LINE_HEIGHT}px;
    color: #71767a;
    font-weight: 400;
    font-feature-settings: "ss01";
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .badge { flex-shrink: 0; }
  .text {
    margin-top: ${TEXT_MARGIN_TOP}px;
    font-size: ${FONT_SIZE}px;
    line-height: ${LINE_HEIGHT}px;
    color: #e6e9ea;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: ${TEXT_MAX_LINES};
    overflow: hidden;
  }
  .media-wrap {
    position: relative;
    width: ${slot.w}px;
    height: ${slot.h}px;
    margin-top: ${GAP_HEADER_MEDIA}px;
    margin-left: ${textColIndent}px;
    align-self: flex-start;
    flex-shrink: 0;
  }
  .media-hole {
    position: absolute;
    inset: 0;
    width: ${slot.w}px;
    height: ${slot.h}px;
    border-radius: ${slot.cornerRadius}px;
    background: #00ff00;
  }
  .media-ring {
    position: absolute;
    inset: 0;
    width: ${slot.w}px;
    height: ${slot.h}px;
    border-radius: ${slot.cornerRadius}px;
    border: ${MEDIA_BORDER}px solid #323639;
    background: transparent;
    pointer-events: none;
  }
  .quote {
    margin-top: ${GAP_MEDIA_QUOTE}px;
    border: ${QUOTE_BORDER}px solid #323639;
    border-radius: ${QUOTE_RADIUS}px;
    padding: ${QUOTE_PAD}px;
    overflow: hidden;
    background: #000;
    flex-shrink: 0;
    align-self: flex-start;
  }
  .quote.quote-single {
    display: flex;
    flex-direction: column;
    gap: ${QUOTE_INNER_GAP}px;
  }
  .quote-body {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: ${HEADER_GAP}px;
    min-width: 0;
  }
  .quote-body .qtext { margin-top: 0; flex: 1; min-width: 0; }
  .quote-head { display: flex; align-items: center; gap: ${NAME_ROW_GAP}px; flex-wrap: nowrap; min-width: 0; }
  .quote .avatar { width: ${QUOTE_AVATAR}px; height: ${QUOTE_AVATAR}px; }
  .quote .name, .quote .handle { font-size: ${FONT_SIZE}px; line-height: ${LINE_HEIGHT}px; }
  .qtext {
    margin-top: ${QUOTE_INNER_GAP}px;
    font-size: ${FONT_SIZE}px;
    line-height: ${LINE_HEIGHT}px;
    color: #e6e9ea;
    white-space: pre-wrap;
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
  }
  .qimgs {
    margin-top: ${QUOTE_INNER_GAP}px;
    display: grid;
    grid-template-columns: repeat(${Math.min(2, Math.max(1, quoteImgCount || 1))}, 1fr);
    grid-template-rows: ${qImgRows};
    gap: ${QUOTE_IMG_GAP}px;
    aspect-ratio: 16 / 9;
    border-radius: ${QUOTE_RADIUS}px;
    overflow: hidden;
  }
  .qimg { width: 100%; height: 100%; object-fit: cover; background: #16181c; display: block; }
  .qimg.qimg-single {
    width: ${QUOTE_SINGLE_IMG}px;
    height: ${QUOTE_SINGLE_IMG}px;
    flex-shrink: 0;
    border-radius: ${QUOTE_RADIUS}px;
  }
  .qimg.ph { background: #16181c; }
  .quote .media-wrap {
    margin-left: 0;
    margin-top: ${QUOTE_INNER_GAP}px;
  }
</style>
</head>
<body>
  <article class="card">
    <div class="header">
      ${avatarHtml(assets.outer.author.avatarPath, AVATAR, assets.outer.author.name)}
      <div class="main">
        <div class="name-row">
          <span class="name">${esc(assets.outer.author.name)}</span>
          ${badge(assets.outer.author.verified, BADGE)}
          <span class="handle">@${esc(assets.outer.author.handle)}</span>
        </div>
        ${outerText ? `<p class="text">${esc(outerText)}</p>` : ''}
      </div>
    </div>
    ${outerHole}
    ${quoteBlock}
  </article>
</body>
</html>`;
}

/** Remote chrome model before assets are downloaded to disk. */

export type XLayoutKind = 'simple_video' | 'quote_of_video' | 'video_quotes';

export interface XAuthorRemote {
  name: string;
  /** Without leading @. */
  handle: string;
  avatarUrl?: string;
  verified: boolean;
}

export interface XTextBlock {
  /** Raw syndication/API text (may include media t.co). */
  text: string;
  /** Visible caption after display_text_range (may be empty). */
  displayText: string;
}

export interface XVideoRemote {
  /** Best-effort mp4 URL from syndication variants, if any. */
  url?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  posterUrl?: string;
}

export interface XImageRemote {
  url: string;
  width?: number;
  height?: number;
}

export interface XQuoteRemote {
  author: XAuthorRemote;
  text: XTextBlock;
  images: XImageRemote[];
  video?: XVideoRemote;
  statusId?: string;
}

/**
 * Chrome + media descriptors for an xrender job (remote URLs only).
 * Phase 2 materializes local paths.
 */
export interface XPostChrome {
  layoutKind: XLayoutKind;
  statusId: string;
  sourceUrl: string;
  outer: {
    author: XAuthorRemote;
    text: XTextBlock;
  };
  /** Video that plays in the export. */
  primaryVideo: XVideoRemote;
  quote?: XQuoteRemote;
}

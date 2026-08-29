import { decodeHtmlEntities, sliceDisplayText, upscaleAvatarUrl } from './truncateTweetText.js';
import type {
  XAuthorRemote,
  XImageRemote,
  XLayoutKind,
  XPostChrome,
  XQuoteRemote,
  XTextBlock,
  XVideoRemote,
} from './twitterChromeTypes.js';

/** Minimal syndication / embed-shaped tweet JSON (defensive). */
export interface SyndicationUser {
  name?: string;
  screen_name?: string;
  profile_image_url_https?: string;
  is_blue_verified?: boolean;
  verified?: boolean;
}

export interface SyndicationMediaDetail {
  type?: string;
  media_url_https?: string;
  original_info?: { width?: number; height?: number };
  video_info?: {
    duration_millis?: number;
    aspect_ratio?: number[];
    variants?: Array<{ content_type?: string; url?: string; bitrate?: number }>;
  };
}

export interface SyndicationPhoto {
  url?: string;
  width?: number;
  height?: number;
}

export interface SyndicationVideo {
  durationMs?: number;
  aspectRatio?: number[];
  poster?: string;
  variants?: Array<{ type?: string; src?: string }>;
}

export interface SyndicationTweet {
  id_str?: string;
  text?: string;
  display_text_range?: number[];
  user?: SyndicationUser;
  mediaDetails?: SyndicationMediaDetail[];
  photos?: SyndicationPhoto[];
  video?: SyndicationVideo | null;
  quoted_tweet?: SyndicationTweet | null;
}

export class TwitterChromeMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitterChromeMapError';
  }
}

function mapAuthor(user: SyndicationUser | undefined): XAuthorRemote {
  return {
    name: decodeHtmlEntities(user?.name?.trim() || 'Unknown'),
    handle: (user?.screen_name ?? '').replace(/^@/, ''),
    avatarUrl: upscaleAvatarUrl(user?.profile_image_url_https),
    verified: Boolean(user?.is_blue_verified || user?.verified),
  };
}

function mapText(text: string | undefined, range: number[] | undefined): XTextBlock {
  const raw = text ?? '';
  return {
    text: raw,
    displayText: sliceDisplayText(raw, range),
  };
}

function bestMp4FromVariants(
  variants: Array<{ content_type?: string; url?: string; bitrate?: number }> | undefined,
): string | undefined {
  if (!variants?.length) return undefined;
  const mp4s = variants
    .filter((v) => v.url && (v.content_type?.includes('mp4') || v.url.includes('.mp4')))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return mp4s[0]?.url ?? variants.find((v) => v.url)?.url;
}

function bestMp4FromVideoObject(video: SyndicationVideo | undefined | null): string | undefined {
  if (!video?.variants?.length) return undefined;
  const mp4s = video.variants
    .filter((v) => v.src && (v.type?.includes('mp4') || v.src.includes('.mp4')))
    .map((v) => ({ url: v.src, bitrate: 0 }));
  // video.variants don't always expose bitrate; pick last mp4 (often highest) or first
  const withSrc = video.variants.filter((v) => v.src && v.type?.includes('mp4'));
  return withSrc.at(-1)?.src ?? withSrc[0]?.src ?? mp4s[0]?.url;
}

function videoFromMediaDetails(
  details: SyndicationMediaDetail[] | undefined,
): XVideoRemote | undefined {
  const vid = (details ?? []).find((m) => m.type === 'video' || m.type === 'animated_gif');
  if (!vid) return undefined;
  const durationMs = vid.video_info?.duration_millis;
  return {
    url: bestMp4FromVariants(vid.video_info?.variants),
    width: vid.original_info?.width,
    height: vid.original_info?.height,
    durationSec: durationMs !== undefined ? durationMs / 1000 : undefined,
    posterUrl: vid.media_url_https,
  };
}

function videoFromVideoObject(
  video: SyndicationVideo | undefined | null,
): XVideoRemote | undefined {
  if (!video) return undefined;
  const [aw, ah] = video.aspectRatio ?? [];
  return {
    url: bestMp4FromVideoObject(video),
    width: aw,
    height: ah,
    durationSec: video.durationMs !== undefined ? video.durationMs / 1000 : undefined,
    posterUrl: video.poster,
  };
}

function mergeVideo(
  fromDetails: XVideoRemote | undefined,
  fromObject: XVideoRemote | undefined,
): XVideoRemote | undefined {
  if (!fromDetails && !fromObject) return undefined;
  return {
    url: fromDetails?.url ?? fromObject?.url,
    width: fromDetails?.width ?? fromObject?.width,
    height: fromDetails?.height ?? fromObject?.height,
    durationSec: fromDetails?.durationSec ?? fromObject?.durationSec,
    posterUrl: fromDetails?.posterUrl ?? fromObject?.posterUrl,
  };
}

function imagesFromTweet(tweet: SyndicationTweet): XImageRemote[] {
  const fromPhotos = (tweet.photos ?? [])
    .filter((p): p is SyndicationPhoto & { url: string } => Boolean(p.url))
    .map((p) => ({ url: p.url, width: p.width, height: p.height }));

  if (fromPhotos.length) return fromPhotos;

  return (tweet.mediaDetails ?? [])
    .filter((m) => m.type === 'photo' && m.media_url_https)
    .map((m) => ({
      url: m.media_url_https as string,
      width: m.original_info?.width,
      height: m.original_info?.height,
    }));
}

function tweetHasVideo(tweet: SyndicationTweet): boolean {
  return Boolean(
    mergeVideo(videoFromMediaDetails(tweet.mediaDetails), videoFromVideoObject(tweet.video)),
  );
}

/**
 * Classify layout from outer + optional quoted tweet video/photo presence.
 * Primary playing video is always on the returned chrome as primaryVideo.
 */
export function classifyLayout(
  outerHasVideo: boolean,
  quote: SyndicationTweet | null | undefined,
): { layoutKind: XLayoutKind; primaryIsQuoted: boolean } | { error: string } {
  const hasQuote = Boolean(quote);
  const quoteHasVideo = hasQuote && tweetHasVideo(quote as SyndicationTweet);

  if (!outerHasVideo && quoteHasVideo) {
    return { layoutKind: 'quote_of_video', primaryIsQuoted: true };
  }
  if (outerHasVideo && hasQuote) {
    return { layoutKind: 'video_quotes', primaryIsQuoted: false };
  }
  if (outerHasVideo) {
    return { layoutKind: 'simple_video', primaryIsQuoted: false };
  }
  return { error: 'no_primary_video' };
}

function mapQuote(quoted: SyndicationTweet): XQuoteRemote {
  return {
    author: mapAuthor(quoted.user),
    text: mapText(quoted.text, quoted.display_text_range),
    images: imagesFromTweet(quoted),
    video: mergeVideo(
      videoFromMediaDetails(quoted.mediaDetails),
      videoFromVideoObject(quoted.video),
    ),
    statusId: quoted.id_str,
  };
}

export interface MapTwitterChromeOptions {
  sourceUrl: string;
  /** When syndication omits id_str. */
  fallbackStatusId?: string;
}

/**
 * Map syndication tweet-result JSON → XPostChrome.
 * Throws TwitterChromeMapError when there is no playable primary video layout.
 */
export function mapTwitterChrome(
  raw: SyndicationTweet,
  opts: MapTwitterChromeOptions,
): XPostChrome {
  const statusId = raw.id_str ?? opts.fallbackStatusId;
  if (!statusId) {
    throw new TwitterChromeMapError('Syndication payload missing status id');
  }

  const outerVideo = mergeVideo(
    videoFromMediaDetails(raw.mediaDetails),
    videoFromVideoObject(raw.video),
  );
  const outerHasVideo = Boolean(outerVideo);
  const quoted = raw.quoted_tweet ?? undefined;

  const classified = classifyLayout(outerHasVideo, quoted);
  if ('error' in classified) {
    throw new TwitterChromeMapError('That post does not have a video to render.');
  }

  const { layoutKind, primaryIsQuoted } = classified;

  let primaryVideo: XVideoRemote;
  if (primaryIsQuoted && quoted) {
    primaryVideo =
      mergeVideo(videoFromMediaDetails(quoted.mediaDetails), videoFromVideoObject(quoted.video)) ??
      {};
  } else {
    primaryVideo = outerVideo ?? {};
  }

  // Multi-video outer posts: more than one video mediaDetail on the primary side.
  const primaryDetails = primaryIsQuoted ? quoted?.mediaDetails : raw.mediaDetails;
  const videoCount = (primaryDetails ?? []).filter(
    (m) => m.type === 'video' || m.type === 'animated_gif',
  ).length;
  if (videoCount > 1) {
    throw new TwitterChromeMapError('Multi-video posts are not supported in /xrender yet.');
  }

  return {
    layoutKind,
    statusId,
    sourceUrl: opts.sourceUrl,
    outer: {
      author: mapAuthor(raw.user),
      text: mapText(raw.text, raw.display_text_range),
    },
    primaryVideo,
    quote: quoted ? mapQuote(quoted) : undefined,
  };
}

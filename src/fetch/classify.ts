export type PostKind = 'video' | 'slideshow';

export interface FormatInfo {
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  url?: string;
}

export interface ThumbnailInfo {
  url?: string;
  id?: string;
  width?: number;
  height?: number;
}

export interface PostInfo {
  album?: boolean | string;
  formats?: FormatInfo[];
  thumbnails?: ThumbnailInfo[];
  url?: string;
  webpage_url?: string;
  duration?: number;
}

export function classify(info: PostInfo): PostKind {
  if (info.album === true || info.album === 'true') {
    return 'slideshow';
  }

  const hasVideoFormat = (info.formats ?? []).some(
    (fmt) => fmt.vcodec && fmt.vcodec !== 'none' && (fmt.height ?? 0) > 0,
  );

  if (hasVideoFormat) {
    return 'video';
  }

  const hasMultipleThumbnails = (info.thumbnails ?? []).length > 1;
  if (hasMultipleThumbnails) {
    return 'slideshow';
  }

  // Fallback: if we see a direct video URL, treat as video.
  if (info.url) {
    return 'video';
  }

  return 'slideshow';
}

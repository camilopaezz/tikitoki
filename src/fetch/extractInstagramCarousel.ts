import { readdirSync, readFileSync } from 'node:fs';

export interface CarouselImageCandidate {
  url: string;
  width?: number;
  height?: number;
}

export interface CarouselItem {
  id: string;
  hasVideo: boolean;
  candidates: CarouselImageCandidate[];
}

interface InstagramCandidate {
  url?: string;
  width?: number;
  height?: number;
}

interface CarouselMediaItem {
  id?: string;
  pk?: string;
  media_type?: number;
  image_versions2?: { candidates?: InstagramCandidate[] };
  video_versions?: unknown[];
}

interface InstagramItem {
  media_type?: number;
  carousel_media?: CarouselMediaItem[];
}

interface InstagramApiResponse {
  items?: InstagramItem[];
}

export function extractCarouselFromJson(raw: string): CarouselItem[] {
  let data: InstagramApiResponse;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  const items = data.items ?? [];
  for (const item of items) {
    const carousel = item.carousel_media ?? [];
    if (carousel.length === 0) continue;

    return carousel.map((media) => {
      const candidates = (media.image_versions2?.candidates ?? [])
        .filter((c): c is InstagramCandidate & { url: string } => Boolean(c.url))
        .map((c) => ({ url: c.url, width: c.width, height: c.height }));

      const hasVideo = media.media_type === 2 || (media.video_versions?.length ?? 0) > 0;

      return {
        id: String(media.id ?? media.pk ?? ''),
        hasVideo,
        candidates,
      };
    });
  }

  return [];
}

export function extractCarouselFromDir(dir: string): CarouselItem[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.dump'));
  } catch {
    return [];
  }

  for (const entry of entries) {
    let raw: string;
    try {
      raw = readFileSync(`${dir}/${entry}`, 'utf8');
    } catch {
      continue;
    }
    const items = extractCarouselFromJson(raw);
    if (items.length > 0) return items;
  }

  return [];
}

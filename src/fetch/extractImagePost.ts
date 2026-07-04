import { readdirSync, readFileSync } from 'node:fs';

export interface SlideImage {
  url: string;
  width?: number;
  height?: number;
}

const UNIVERSAL_DATA_REGEX =
  /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/;

interface ImagePostImage {
  imageURL?: { urlList?: string[] };
  imageWidth?: number;
  imageHeight?: number;
}

interface ItemStruct {
  imagePost?: { images?: ImagePostImage[] };
  music?: { duration?: number };
  video?: { duration?: number };
}

interface UniversalData {
  __DEFAULT_SCOPE__?: {
    'webapp.video-detail'?: {
      itemInfo?: { itemStruct?: ItemStruct };
    };
  };
}

export function extractImagePostFromHtml(html: string): SlideImage[] {
  const match = html.match(UNIVERSAL_DATA_REGEX);
  if (!match) return [];

  let data: UniversalData;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const itemStruct = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  const images = itemStruct?.imagePost?.images;
  if (!images) return [];

  const slides: SlideImage[] = [];
  for (const img of images) {
    const url = img.imageURL?.urlList?.[0];
    if (url) {
      slides.push({ url, width: img.imageWidth, height: img.imageHeight });
    }
  }
  return slides;
}

export function extractMusicDurationFromHtml(html: string): number | undefined {
  const match = html.match(UNIVERSAL_DATA_REGEX);
  if (!match) return undefined;

  let data: UniversalData;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return undefined;
  }

  const itemStruct = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  return itemStruct?.music?.duration ?? itemStruct?.video?.duration ?? undefined;
}

export function extractImagePostFromDir(dir: string): SlideImage[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.dump'));
  } catch {
    return [];
  }

  for (const entry of entries) {
    const filePath = `${dir}/${entry}`;
    let html: string;
    try {
      html = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const slides = extractImagePostFromHtml(html);
    if (slides.length > 0) return slides;
  }
  return [];
}

export function extractMusicDurationFromDir(dir: string): number | undefined {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.dump'));
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    const filePath = `${dir}/${entry}`;
    let html: string;
    try {
      html = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const duration = extractMusicDurationFromHtml(html);
    if (duration) return duration;
  }
  return undefined;
}

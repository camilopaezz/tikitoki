import { readdirSync, readFileSync } from 'node:fs';

export interface CarouselMusic {
  url?: string;
  duration?: number;
  startTimeMs?: number;
}

const DATA_SJS_REGEX = /<script[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/gi;

const URL_KEYS_PRIORITY = ['download_url', 'progressive_download_url', 'audio_uri', 'uri', 'url'];

const DURATION_KEYS = new Set([
  'duration',
  'duration_ms',
  'duration_in_ms',
  'total_duration_ms',
  'length',
]);

const START_TIME_KEYS = new Set([
  'audio_asset_start_time_in_ms',
  'start_time_in_ms',
  'audio_start_time_in_ms',
  'music_start_time_in_ms',
  'start_ms',
]);

const SKIP_PATH_KEYWORDS = ['artwork', 'cover', 'thumbnail', 'image', 'avatar', 'profile'];

function isMusicKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('music') || lower.includes('audio');
}

function isSkipPath(key: string): boolean {
  const lower = key.toLowerCase();
  return SKIP_PATH_KEYWORDS.some((kw) => lower.includes(kw));
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeDuration(value: number, key: string): number {
  const lower = key.toLowerCase();
  if (lower.includes('ms') || lower.includes('milli')) {
    return value / 1000;
  }
  if (value > 1000) {
    return value / 1000;
  }
  return value;
}

function harvestFromSubtree(node: unknown, acc: CarouselMusic, path: string[] = []): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) harvestFromSubtree(item, acc, path);
    return;
  }
  const entries = Object.entries(node as Record<string, unknown>);
  for (const expected of URL_KEYS_PRIORITY) {
    for (const [k, v] of entries) {
      if (k.toLowerCase() !== expected) continue;
      if (typeof v !== 'string') continue;
      if (acc.url === undefined) {
        acc.url = v;
      }
    }
  }
  for (const [k, v] of entries) {
    const lower = k.toLowerCase();
    if (DURATION_KEYS.has(lower) && typeof v === 'number' && acc.duration === undefined) {
      acc.duration = normalizeDuration(v, k);
      continue;
    }
    if (START_TIME_KEYS.has(lower) && typeof v === 'number' && acc.startTimeMs === undefined) {
      acc.startTimeMs = v;
      continue;
    }
    if (typeof v === 'object' && v !== null && !isSkipPath(k)) {
      harvestFromSubtree(v, acc, [...path, k]);
    }
  }
}

function walk(node: unknown, visit: (key: string, value: unknown) => void): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    visit(k, v);
    walk(v, visit);
  }
}

function findMusicAsset(data: unknown, acc: CarouselMusic): void {
  walk(data, (key, value) => {
    if (!isMusicKey(key)) return;
    if (typeof value === 'string') {
      if (looksLikeUrl(value) && acc.url === undefined) {
        acc.url = value;
      }
      return;
    }
    harvestFromSubtree(value, acc);
  });
}

export function extractMusicFromJson(data: unknown): CarouselMusic {
  const acc: CarouselMusic = {};
  findMusicAsset(data, acc);
  return acc;
}

export function extractMusicFromHtml(html: string): CarouselMusic {
  const acc: CarouselMusic = {};
  const matches = [...html.matchAll(DATA_SJS_REGEX)];
  for (const match of matches) {
    const raw = match[1];
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    findMusicAsset(data, acc);
  }
  return acc;
}

export function extractMusicFromDir(dir: string): CarouselMusic {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith('.dump'));
  } catch {
    return {};
  }

  const acc: CarouselMusic = {};
  for (const entry of entries) {
    const filePath = `${dir}/${entry}`;
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const music = parseDumpFile(raw);
    if (music.url && acc.url === undefined) acc.url = music.url;
    if (music.duration !== undefined && acc.duration === undefined) {
      acc.duration = music.duration;
    }
  }
  return acc;
}

function parseDumpFile(raw: string): CarouselMusic {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(raw);
      return extractMusicFromJson(data);
    } catch {
      // not valid JSON; fall through to HTML parsing
    }
  }
  return extractMusicFromHtml(raw);
}

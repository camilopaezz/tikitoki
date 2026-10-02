export type JobId = string;
export type Stage = 'Fetching' | 'Rendering' | 'Uploading';

/** How the pipeline should handle the post. Default is passthrough download. */
export type JobMode = 'passthrough' | 'xrender' | 'slideshow';

export interface Job {
  jobId: JobId;
  userId: number;
  url: string;
  /** Defaults to passthrough when omitted (older call sites / tests). */
  mode?: JobMode;
}

export interface DownloadedMedia {
  type: 'photo' | 'video';
  path: string;
}

export interface JobResult {
  outputPath: string;
  /** Defaults to video when omitted (TikTok / X / xrender). */
  kind?: 'video' | 'image' | 'album';
  /** Ordered photos and videos for an album. */
  media?: DownloadedMedia[];
  /** All photo paths when kind is image. One path is a single photo; 2+ is an album. */
  images?: string[];
}

export type StageCallback = (stage: Stage) => void | Promise<void>;

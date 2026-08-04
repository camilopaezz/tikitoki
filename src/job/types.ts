export type JobId = string;
export type Stage = 'Fetching' | 'Rendering' | 'Uploading';

/** How the pipeline should handle the post. Default is passthrough download. */
export type JobMode = 'passthrough' | 'xrender';

export interface Job {
  jobId: JobId;
  userId: number;
  url: string;
  /** Defaults to passthrough when omitted (older call sites / tests). */
  mode?: JobMode;
}

export interface JobResult {
  outputPath: string;
}

export type StageCallback = (stage: Stage) => void | Promise<void>;

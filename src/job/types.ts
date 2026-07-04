export type JobId = string;
export type Stage = 'Fetching' | 'Rendering' | 'Uploading';

export interface Job {
  jobId: JobId;
  userId: number;
  url: string;
}

export interface JobResult {
  outputPath: string;
}

export type StageCallback = (stage: Stage) => void | Promise<void>;

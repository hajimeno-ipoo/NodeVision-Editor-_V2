export type JobState =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'coolingDown'
  | 'completed'
  | 'failed'
  | 'canceled';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface JobProgressSnapshot {
  ratio: number;
  outputTimeMs: number;
  totalTimeMs: number | null;
  estimatedTotalTimeMs: number | null;
}

export interface JobHistoryEntry {
  jobId: string;
  name: string;
  status: JobState;
  outputPath?: string | null;
  errorMessage?: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  metadata?: Record<string, unknown>;
  logLevel: LogLevel;
  message?: string | null;
}

export interface JobSnapshot {
  jobId: string;
  name: string;
  status: JobState;
  progress: JobProgressSnapshot;
  metadata?: Record<string, unknown>;
}

export interface JobRunContext {
  signal: AbortSignal;
  progress: JobProgressSnapshotProvider;
}

export interface JobPreviewContext {
  signal: AbortSignal;
}

export interface JobProgressSnapshotProvider {
  snapshot(): JobProgressSnapshot;
  updateOutputTime(milliseconds: number): JobProgressSnapshot;
  setTotalTime(milliseconds: number | null): JobProgressSnapshot;
  setEstimatedTotalTime(milliseconds: number | null): JobProgressSnapshot;
}

export interface JobRunResult<TResult = unknown> {
  outputPath?: string | null;
  totalTimeMs?: number | null;
  outputTimeMs?: number | null;
  result?: TResult;
}

export interface QueueJobOptions<TResult = unknown> {
  name: string;
  estimatedTotalTimeMs?: number | null;
  metadata?: Record<string, unknown>;
  execute: (ctx: JobRunContext) => Promise<JobRunResult<TResult>>;
  generatePreview?: (result: JobRunResult<TResult>, ctx: JobPreviewContext) => Promise<void> | void;
}

export interface HistoryStore {
  record(entry: JobHistoryEntry): void;
  entries(): JobHistoryEntry[];
}

export interface InspectRequestLog {
  id: string;
  timestamp: string;
  durationMs: number;
  statusCode: number;
  tokenLabel: string | null;
  requestBytes: number;
  responseCode?: string | null;
  logLevel: LogLevel;
  meta?: Record<string, unknown> | null;
}

export interface InspectRequestHistoryStore {
  record(entry: InspectRequestLog): void;
  entries(): InspectRequestLog[];
}

export interface CancelAllSummary {
  runningJobId: string | null;
  runningJobIds: string[];
  queuedJobIds: string[];
}

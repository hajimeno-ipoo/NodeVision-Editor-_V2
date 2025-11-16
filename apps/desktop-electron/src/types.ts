import type { JobHistoryEntry, JobSnapshot, InspectRequestLog, LogLevel } from '@nodevision/engine';
import type { NodeVisionSettings } from '@nodevision/settings';
import type { BinaryLicense, FFmpegDetectionResult } from '@nodevision/system-check';
import type { TokenRecord } from '@nodevision/tokens';

export interface FFmpegDistributionMetadata {
  origin: 'bundled' | 'external';
  license: BinaryLicense;
  licenseUrl: string;
  sourceUrl: string;
}

export interface BootStatus {
  settings: NodeVisionSettings;
  ffmpeg: FFmpegDetectionResult;
  token: TokenRecord;
  distribution: {
    ffmpeg: FFmpegDistributionMetadata;
  };
}

export interface QueueWarning {
  type: 'QUEUE_FULL' | 'QUEUE_TIMEOUT';
  level: LogLevel;
  message: string;
  occurredAt: string;
}

export interface QueueLimits {
  maxParallelJobs: number;
  maxQueueLength: number;
  queueTimeoutMs: number;
}

export interface QueueSnapshot {
  active: JobSnapshot[];
  queued: JobSnapshot[];
  history: JobHistoryEntry[];
  warnings?: QueueWarning[];
  limits?: QueueLimits;
}

export interface DiagnosticsSnapshot {
  collectCrashDumps: boolean;
  lastTokenPreview: string | null;
  lastLogExportPath: string | null;
  lastExportSha?: string | null;
  inspectHistory: InspectRequestLog[];
}

export interface WorkflowRecord {
  id: string;
  name: string;
  data: string;
  updatedAt: string;
}

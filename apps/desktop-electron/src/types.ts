import type { JobHistoryEntry, JobSnapshot, InspectRequestLog } from '@nodevision/engine';
import type { NodeVisionSettings } from '@nodevision/settings';
import type { FFmpegDetectionResult } from '@nodevision/system-check';
import type { TokenRecord } from '@nodevision/tokens';

export interface BootStatus {
  settings: NodeVisionSettings;
  ffmpeg: FFmpegDetectionResult;
  token: TokenRecord;
}

export interface QueueSnapshot {
  active: JobSnapshot[];
  queued: JobSnapshot[];
  history: JobHistoryEntry[];
}

export interface DiagnosticsSnapshot {
  collectCrashDumps: boolean;
  lastTokenPreview: string | null;
  lastLogExportPath: string | null;
  lastExportSha?: string | null;
  inspectHistory: InspectRequestLog[];
}

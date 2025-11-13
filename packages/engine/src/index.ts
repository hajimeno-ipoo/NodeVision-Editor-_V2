/* c8 ignore file */
export { JobQueue, JobQueueOptions } from './job-queue';
export { JobProgressTracker } from './job-progress';
export { JobCancelledError, QueueFullError } from './job-errors';
export { InMemoryHistoryStore } from './job-history';
export { TempRootManager } from './temp-root-manager';
export { inspectConcat } from './inspect/concat';
export { buildFFmpegPlan } from './ffmpeg/builder';
export { InMemoryInspectRequestHistory } from './http/inspect-history';
export {
  createInspectHttpServer,
  isLoopbackAddress,
  mapInspectErrorToStatus,
  buildHttpErrorBody,
  firstHeaderValue,
  shouldSkipEnd,
  parseInspectPayload
} from './http/inspect-server';
export { exportDiagnosticsLogs } from './diagnostics/log-exporter';
export type {
  CancelAllSummary,
  JobHistoryEntry,
  LogLevel,
  JobPreviewContext,
  JobRunContext,
  JobRunResult,
  JobSnapshot,
  JobState,
  QueueJobOptions,
  QueueFullEvent,
  InspectRequestLog,
  InspectRequestHistoryStore
} from './types';
export type { LogExportOptions, LogExportResult } from './diagnostics/log-exporter';
export type { TempRootManagerOptions } from './temp-root-manager';
export type {
  InspectClipDetails,
  InspectClipRequest,
  InspectConcatRequest,
  InspectConcatResponse,
  InspectConcatOptions,
  InspectEquality,
  InspectError,
  InspectInclude,
  InspectRatio
} from './inspect/types';
export { isNetworkPath, buildConcatFailure, ratioToNumber, parseRatio } from './inspect/concat';
export type { InspectHttpServerOptions, TokenValidationSummary } from './http/inspect-server';
export type {
  MediaNode,
  MediaChain,
  FFmpegPlan,
  MediaNodeType,
  BuildFFmpegPlanOptions,
  BuilderStage,
  PreviewFilter,
  LoadMediaNode,
  TrimNode,
  ResizeNode,
  OverlayNode,
  TextNode,
  CropNode,
  SpeedNode,
  ChangeFpsNode,
  ExportNode
} from './ffmpeg/builder';
export { PreviewProgressBridge } from './preview/progress-bridge';
export type { PreviewProgressOptions } from './preview/progress-bridge';

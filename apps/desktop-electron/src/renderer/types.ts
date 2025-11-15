import type { RendererPayload } from '../ui-template';
import type { QueueLimits, QueueSnapshot, QueueWarning, DiagnosticsSnapshot } from '../types';

export interface RendererBootstrapWindow extends Window {
  __NODEVISION_BOOTSTRAP__?: RendererPayload;
  __NODEVISION_TRANSLATIONS__?: Record<string, Record<string, string>>;
  __NODEVISION_SUPPORTED_LOCALES__?: string[];
  __NODEVISION_FALLBACK_LOCALE__?: string;
}

export type RendererNode = RendererPayload['nodes'][number];
export type RendererConnection = RendererPayload['connections'][number];
export type NodeTemplate = RendererPayload['templates'][number];
export type NodePort = RendererNode['inputs'][number] | RendererNode['outputs'][number];
export type PortDirection = 'input' | 'output';
export type JobSnapshot = QueueSnapshot['active'][number];
export type JobHistoryEntry = QueueSnapshot['history'][number];
export type TemplateVars = Record<string, string | number | boolean | null | undefined>;
export type Point = { x: number; y: number };
export type SerializedNode = Partial<RendererNode> & { id: string; typeId: string; position?: Partial<Point> };

export interface PendingConnection {
  fromNodeId: string;
  fromPortId: string;
  detachedConnectionId?: string;
}

export interface DraggingConnection extends PendingConnection {
  cursor: Point;
}

export interface RendererQueueState {
  active: QueueSnapshot['active'];
  queued: QueueSnapshot['queued'];
  history: QueueSnapshot['history'];
  warnings: QueueWarning[];
  limits: QueueLimits;
}

export interface RendererDiagnostics extends DiagnosticsSnapshot {
  lastExportSha: string | null;
}

export interface NodeMediaPreview {
  url: string;
  name: string;
  size: number;
  type: string;
  kind: 'image' | 'video';
  width: number | null;
  height: number | null;
}

export interface RendererState {
  locale: string;
  nodes: RendererNode[];
  selection: Set<string>;
  clipboard: RendererNode[];
  zoom: number;
  history: HistoryEntry[];
  historyIndex: number;
  autosaveTimer: number | null;
  lastAutosave: Date | null;
  isRunning: boolean;
  readonly: boolean;
  queue: RendererQueueState;
  diagnostics: RendererDiagnostics;
  connections: RendererConnection[];
  pendingConnection: PendingConnection | null;
  draggingConnection: DraggingConnection | null;
  highlightedConnections: Set<string>;
  pressedNodeId: string | null;
  mediaPreviews: Map<string, NodeMediaPreview>;
}

export interface HistoryEntry {
  nodes: RendererNode[];
  connections: RendererConnection[];
}

export interface RendererDom {
  statusList: HTMLUListElement;
  canvas: HTMLElement;
  nodeLayer: HTMLElement;
  connectionLayer: SVGSVGElement;
  searchInput: HTMLInputElement;
  suggestions: HTMLUListElement;
  autosave: HTMLElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  json: HTMLTextAreaElement;
  export: HTMLButtonElement;
  load: HTMLButtonElement;
  runningToggle: HTMLInputElement;
  localeSelect: HTMLSelectElement;
  readonlyBanner: HTMLElement;
  queueRunning: HTMLElement;
  queueQueued: HTMLElement;
  queueHistory: HTMLElement;
  queueWarnings: HTMLElement;
  crashConsent: HTMLInputElement;
  logPassword: HTMLInputElement;
  exportLogs: HTMLButtonElement;
  exportStatus: HTMLElement;
  inspectHistory: HTMLElement;
  connectionsList: HTMLUListElement;
  connectionHint: HTMLElement;
  demoJob: HTMLButtonElement;
  cancelAll: HTMLButtonElement;
  toast: HTMLElement;
  aboutDistribution: HTMLElement;
  aboutLicense: HTMLElement;
  aboutPath: HTMLElement;
  aboutVersion: HTMLElement;
  aboutNotice: HTMLElement;
  aboutLicenseLink: HTMLAnchorElement;
  aboutSourceLink: HTMLAnchorElement;
}

export interface ExportLogsResult {
  ok: boolean;
  diagnostics?: DiagnosticsSnapshot;
  result?: { outputPath?: string | null; sha256?: string | null };
  message?: string;
}

export interface EnqueueJobResult {
  ok: boolean;
  code?: string;
  max?: number;
  error?: string;
  message?: string;
}

export interface NodevisionApi {
  getQueueSnapshot?: () => Promise<QueueSnapshot>;
  enqueueDemoJob?: (payload: { name: string }) => Promise<EnqueueJobResult>;
  cancelAllJobs?: () => Promise<void>;
  exportLogs?: (password: string | null) => Promise<ExportLogsResult>;
  setCrashDumpConsent?: (enabled: boolean) => Promise<{ collectCrashDumps: boolean }>;
}

export type {
  RendererPayload
};

import type { RendererPayload } from '../ui-template';
import type { QueueLimits, QueueSnapshot, QueueWarning, DiagnosticsSnapshot, WorkflowRecord } from '../types';

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

export type StoredWorkflow = WorkflowRecord;

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
  durationMs?: number | null;
  ownedUrl?: boolean;
  derivedFrom?: string;
  filePath?: string | null;
  cropRegion?: { x: number; y: number; width: number; height: number };
  cropSpace?: 'stage' | 'image';
  cropRotationDeg?: number;
  cropZoom?: number;
  cropFlipHorizontal?: boolean;
  cropFlipVertical?: boolean;
  /** ffmpeg 等で実ファイルをクロップ済みの場合のフラグ */
  isCroppedOutput?: boolean;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface NodeResizeSession {
  nodeId: string;
  handle: 'nw' | 'ne' | 'sw' | 'se';
  startPointer: { x: number; y: number };
  startSize: NodeSize;
  startPosition: { x: number; y: number };
  element: HTMLElement;
}

export type CanvasTool = 'select' | 'pan';

export interface RendererState {
  locale: string;
  nodes: RendererNode[];
  selection: Set<string>;
  clipboard: RendererNode[];
  zoom: number;
  viewport: Point;
  activeTool: CanvasTool;
  canvasControlsPosition: Point | null;
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
  nodeSizes: Map<string, NodeSize>;
  nodeChrome: Map<string, number>;
  resizing: NodeResizeSession | null;
  workflows: StoredWorkflow[];
  activeWorkflowId: string | null;
  workflowName: string;
  workflowDirty: boolean;
  workflowSearch: string;
  workflowMenuOpen?: boolean;
  workflowContextMenuOpen?: boolean;
  workflowContextTargetId: string | null;
}

export interface HistoryEntry {
  nodes: RendererNode[];
  connections: RendererConnection[];
}

export interface RendererDom {
  canvasControls: HTMLElement;
  statusList: HTMLUListElement;
  canvas: HTMLElement;
  canvasGrid: HTMLElement;
  selectionRect: HTMLElement;
  selectionOutline: HTMLElement;
  nodeLayer: HTMLElement;
  connectionLayer: SVGSVGElement;
  toolSelect: HTMLButtonElement;
  toolPan: HTMLButtonElement;
  fitView: HTMLButtonElement;
  zoomDisplay: HTMLButtonElement;
  zoomMenu: HTMLElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  zoomFitMenu: HTMLButtonElement;
  zoomApply: HTMLButtonElement;
  zoomInput: HTMLInputElement;
  searchInput: HTMLInputElement;
  suggestions: HTMLUListElement;
  autosave: HTMLElement;
  undo: HTMLButtonElement;
  redo: HTMLButtonElement;
  json: HTMLTextAreaElement;
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
  workflowToggle: HTMLButtonElement;
  workflowMenu: HTMLElement;
  workflowNameLabel: HTMLElement;
  workflowMenuRename: HTMLButtonElement;
  workflowMenuFileSave: HTMLButtonElement;
  workflowMenuFileLoad: HTMLButtonElement;
  workflowMenuSaveAs: HTMLButtonElement;
  workflowMenuClear: HTMLButtonElement;
  workflowMenuBrowse: HTMLButtonElement;
  workflowSearch: HTMLInputElement;
  workflowList: HTMLUListElement;
  workflowEmpty: HTMLElement;
  workflowCreate: HTMLButtonElement;
  workflowContextMenu: HTMLElement;
  workflowContextDelete: HTMLButtonElement;
  workflowNameDialog: HTMLElement;
  workflowNameInput: HTMLInputElement;
  workflowNameConfirm: HTMLButtonElement;
  workflowNameCancel: HTMLButtonElement;
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
  loadWorkflows?: () => Promise<{ ok: boolean; workflows?: StoredWorkflow[]; message?: string }>;
  saveWorkflows?: (workflows: StoredWorkflow[]) => Promise<{ ok: boolean; message?: string }>;
  storeMediaFile?: (payload: { name: string; buffer: ArrayBuffer }) => Promise<{ ok: boolean; path?: string; url?: string; message?: string }>;
  generateCroppedPreview?: (payload: {
    sourcePath: string;
    kind: 'image' | 'video';
    region: { x: number; y: number; width: number; height: number };
    regionSpace?: 'stage' | 'image';
    rotationDeg?: number;
    zoom?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
    aspectMode?: string;
    widthHint?: number | null;
    heightHint?: number | null;
    durationMs?: number | null;
  }) => Promise<
    | {
        ok: true;
        preview: {
          url: string;
          width: number | null;
          height: number | null;
          durationMs?: number | null;
          type: string;
          kind: 'image' | 'video';
          ownedUrl: true;
        };
      }
    | { ok: false; message?: string }
  >;
}

export type {
  RendererPayload
};

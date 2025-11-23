import type { QueueLimits } from '../types';
import type { RendererPayload } from './types';
import type {
  RendererConnection,
  RendererDiagnostics,
  RendererNode,
  RendererQueueState,
  RendererState,
  NodePort,
  HistoryEntry,
  NodeMediaPreview,
  NodeSize
} from './types';

export const DEFAULT_QUEUE_LIMITS: QueueLimits = {
  maxParallelJobs: 1,
  maxQueueLength: 4,
  queueTimeoutMs: 180_000
};

export const DEFAULT_NODE_WIDTH = 336;
export const DEFAULT_NODE_HEIGHT = 460;

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const clonePorts = (ports: NodePort[] | undefined): NodePort[] =>
  Array.isArray(ports) ? ports.map(port => ({ ...port })) : [];

export const cloneNode = (node: RendererNode): RendererNode => {
  const copy = deepClone(node);
  copy.inputs = clonePorts(copy.inputs);
  copy.outputs = clonePorts(copy.outputs);
  return copy;
};

export const cloneConnection = (connection: RendererConnection): RendererConnection => {
  const copy = deepClone(connection);
  if (!copy.id) {
    copy.id = crypto?.randomUUID ? crypto.randomUUID() : `connection-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  }
  return copy;
};

const buildQueueState = (bootstrap: RendererPayload): RendererQueueState => ({
  active: bootstrap.queue?.active ?? [],
  queued: bootstrap.queue?.queued ?? [],
  history: bootstrap.queue?.history ?? [],
  warnings: bootstrap.queue?.warnings ?? [],
  limits: bootstrap.queue?.limits ?? DEFAULT_QUEUE_LIMITS
});

const buildDiagnostics = (bootstrap: RendererPayload): RendererDiagnostics => ({
  collectCrashDumps: bootstrap.diagnostics?.collectCrashDumps ?? false,
  lastTokenPreview: bootstrap.diagnostics?.lastTokenPreview ?? null,
  lastLogExportPath: bootstrap.diagnostics?.lastLogExportPath ?? null,
  lastExportSha: bootstrap.diagnostics?.lastExportSha ?? null,
  inspectHistory: bootstrap.diagnostics?.inspectHistory ?? []
});

export const createInitialState = (bootstrap: RendererPayload, locale: string): RendererState => {
  const nodes = (bootstrap.nodes ?? []).map(cloneNode);
  const nodeSizes = new Map<string, NodeSize>();
  nodes.forEach(node =>
    nodeSizes.set(node.id, {
      width: Math.max(DEFAULT_NODE_WIDTH, node.width ?? DEFAULT_NODE_WIDTH),
      height: Math.max(DEFAULT_NODE_HEIGHT, node.height ?? DEFAULT_NODE_HEIGHT)
    })
  );
  return {
    locale,
    nodes,
    selection: new Set<string>(),
    clipboard: [] as RendererNode[],
    zoom: 1,
    viewport: { x: 0, y: 0 },
    activeTool: 'select',
    canvasControlsPosition: null,
    history: [] as HistoryEntry[],
    historyIndex: -1,
    autosaveTimer: null,
    lastAutosave: null,
    isRunning: false,
    readonly: false,
    queue: buildQueueState(bootstrap),
    diagnostics: buildDiagnostics(bootstrap),
    connections: (bootstrap.connections ?? []).map(cloneConnection),
    pendingConnection: null,
    draggingConnection: null,
    highlightedConnections: new Set<string>(),
    pressedNodeId: null,
    mediaPreviews: new Map<string, NodeMediaPreview>(),
    nodeSizes,
    nodeChrome: new Map<string, number>(),
    resizing: null,
    workflows: [],
    activeWorkflowId: null,
    workflowName: 'Unsaved Workflow',
    workflowDirty: false,
    workflowSearch: '',
    workflowMenuOpen: false,
    workflowContextMenuOpen: false,
    workflowContextTargetId: null
  };
};

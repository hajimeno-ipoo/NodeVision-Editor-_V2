import { contextBridge, ipcRenderer } from 'electron';
import type CropperType from 'cropperjs';

import type { WorkflowRecord } from './types';

type QueueEnqueuePayload = {
  name?: string;
};

interface NodeVisionBridge {
  enqueueDemoJob(payload: QueueEnqueuePayload): Promise<{ ok: boolean; error?: string; code?: string }>;
  cancelAllJobs(): Promise<void>;
  getQueueSnapshot(): Promise<unknown>;
  exportLogs(password: string | null): Promise<unknown>;
  setCrashDumpConsent(enabled: boolean): Promise<{ collectCrashDumps: boolean }>;
  loadWorkflows(): Promise<{ ok: boolean; workflows?: WorkflowRecord[]; message?: string }>;
  saveWorkflows(workflows: WorkflowRecord[]): Promise<{ ok: boolean; message?: string }>;
  storeMediaFile(payload: { name: string; buffer: ArrayBuffer }): Promise<{ ok: boolean; path?: string; url?: string; message?: string }>;
  generateCroppedPreview(payload: {
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
  }): Promise<unknown>;
}

const api: NodeVisionBridge = {
  enqueueDemoJob: payload => ipcRenderer.invoke('nodevision:queue:enqueue', payload ?? {}),
  cancelAllJobs: () => ipcRenderer.invoke('nodevision:queue:cancelAll'),
  getQueueSnapshot: () => ipcRenderer.invoke('nodevision:queue:snapshot'),
  exportLogs: password => ipcRenderer.invoke('nodevision:logs:export', { password }),
  setCrashDumpConsent: enabled => ipcRenderer.invoke('nodevision:diagnostics:setCrashDumpConsent', { enabled }),
  loadWorkflows: () => ipcRenderer.invoke('nodevision:workflows:load'),
  saveWorkflows: workflows => ipcRenderer.invoke('nodevision:workflows:save', { workflows }),
  storeMediaFile: payload => ipcRenderer.invoke('nodevision:media:store', payload),
  generateCroppedPreview: payload => ipcRenderer.invoke('nodevision:preview:crop', payload)
};

const loadCropper = (): typeof CropperType | null => {
  const candidates = [
    'cropperjs',
    '../node_modules/cropperjs',
    '../../node_modules/cropperjs'
  ];
  for (const id of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(id) as { default?: typeof CropperType } | undefined;
      return (mod?.default ?? (mod as unknown as typeof CropperType)) as typeof CropperType;
    } catch (error) {
      /* try next path */
    }
  }
  console.warn('[NodeVision][preload] cropperjs module not found; crop UI will be limited.');
  return null;
};

const cropperModule = loadCropper();

contextBridge.exposeInMainWorld('nodevision', api);
if (cropperModule) {
  contextBridge.exposeInMainWorld('Cropper', cropperModule);
}
contextBridge.exposeInMainWorld('nodeRequire', require);

declare global {
  interface Window {
    nodevision: NodeVisionBridge;
    Cropper: typeof Cropper;
    nodeRequire: NodeRequire;
  }
}

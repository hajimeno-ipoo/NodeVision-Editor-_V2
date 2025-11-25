import { contextBridge, ipcRenderer } from 'electron';

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
  getSiblingMediaFile(payload: { currentPath: string; direction: 'next' | 'prev'; nodeKind?: 'image' | 'video' | 'any' }): Promise<{ ok: boolean; name?: string; path?: string; buffer?: ArrayBuffer; message?: string }>;
  loadFileByPath(payload: { filePath: string }): Promise<{ ok: boolean; name?: string; path?: string; buffer?: ArrayBuffer; message?: string }>;
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
    durationMs?: number | null;
  }): Promise<unknown>;
  showSaveDialog(payload: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ filePath?: string; canceled: boolean }>;
  enqueueExportJob(payload: {
    sourcePath: string;
    outputPath: string;
    format: string;
    quality: string;
    nodes?: any[];
    slot?: number;
  }): Promise<{ ok: boolean; message?: string }>;
  enqueueZipJob(payload: { files: string[]; outputPath: string; password?: string }): Promise<{ ok: boolean; message?: string }>;
}

const api: NodeVisionBridge = {
  showSaveDialog: (payload) => ipcRenderer.invoke('nodevision:dialog:save', payload),
  enqueueExportJob: (payload) => ipcRenderer.invoke('nodevision:queue:export', payload),
  enqueueZipJob: (payload) => ipcRenderer.invoke('nodevision:queue:zip', payload),
  enqueueDemoJob: payload => ipcRenderer.invoke('nodevision:queue:enqueue', payload ?? {}),
  cancelAllJobs: () => ipcRenderer.invoke('nodevision:queue:cancelAll'),
  getQueueSnapshot: () => ipcRenderer.invoke('nodevision:queue:snapshot'),
  exportLogs: password => ipcRenderer.invoke('nodevision:logs:export', { password }),
  setCrashDumpConsent: enabled => ipcRenderer.invoke('nodevision:diagnostics:setCrashDumpConsent', { enabled }),
  loadWorkflows: () => ipcRenderer.invoke('nodevision:workflows:load'),
  saveWorkflows: workflows => ipcRenderer.invoke('nodevision:workflows:save', { workflows }),
  storeMediaFile: payload => ipcRenderer.invoke('nodevision:media:store', payload),
  getSiblingMediaFile: payload => ipcRenderer.invoke('nodevision:media:getSiblingFile', payload),
  loadFileByPath: payload => ipcRenderer.invoke('nodevision:media:loadFileByPath', payload),
  generateCroppedPreview: payload => ipcRenderer.invoke('nodevision:preview:crop', payload)
};

contextBridge.exposeInMainWorld('nodevision', api);
contextBridge.exposeInMainWorld('nodeRequire', require);

declare global {
  interface Window {
    nodevision: NodeVisionBridge;
    nodeRequire: NodeRequire;
  }
}

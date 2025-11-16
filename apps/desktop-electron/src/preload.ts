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
}

const api: NodeVisionBridge = {
  enqueueDemoJob: payload => ipcRenderer.invoke('nodevision:queue:enqueue', payload ?? {}),
  cancelAllJobs: () => ipcRenderer.invoke('nodevision:queue:cancelAll'),
  getQueueSnapshot: () => ipcRenderer.invoke('nodevision:queue:snapshot'),
  exportLogs: password => ipcRenderer.invoke('nodevision:logs:export', { password }),
  setCrashDumpConsent: enabled => ipcRenderer.invoke('nodevision:diagnostics:setCrashDumpConsent', { enabled }),
  loadWorkflows: () => ipcRenderer.invoke('nodevision:workflows:load'),
  saveWorkflows: workflows => ipcRenderer.invoke('nodevision:workflows:save', { workflows })
};

contextBridge.exposeInMainWorld('nodevision', api);

declare global {
  interface Window {
    nodevision: NodeVisionBridge;
  }
}

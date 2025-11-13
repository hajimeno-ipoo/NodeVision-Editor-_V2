import { contextBridge, ipcRenderer } from 'electron';

type QueueEnqueuePayload = {
  name?: string;
};

interface NodeVisionBridge {
  enqueueDemoJob(payload: QueueEnqueuePayload): Promise<{ ok: boolean; error?: string; code?: string }>;
  cancelAllJobs(): Promise<void>;
  getQueueSnapshot(): Promise<unknown>;
  exportLogs(password: string | null): Promise<unknown>;
  setCrashDumpConsent(enabled: boolean): Promise<{ collectCrashDumps: boolean }>;
}

const api: NodeVisionBridge = {
  enqueueDemoJob: payload => ipcRenderer.invoke('nodevision:queue:enqueue', payload ?? {}),
  cancelAllJobs: () => ipcRenderer.invoke('nodevision:queue:cancelAll'),
  getQueueSnapshot: () => ipcRenderer.invoke('nodevision:queue:snapshot'),
  exportLogs: password => ipcRenderer.invoke('nodevision:logs:export', { password }),
  setCrashDumpConsent: enabled => ipcRenderer.invoke('nodevision:diagnostics:setCrashDumpConsent', { enabled })
};

contextBridge.exposeInMainWorld('nodevision', api);

declare global {
  interface Window {
    nodevision: NodeVisionBridge;
  }
}

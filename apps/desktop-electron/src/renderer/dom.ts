import type { RendererDom } from './types';

const getElement = <T extends Element>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`NodeVision renderer missing #${id}`);
  }
  return element as unknown as T;
};

export const captureDomElements = (): RendererDom => ({
  statusList: getElement<HTMLUListElement>('status-list'),
  canvas: getElement<HTMLElement>('canvas'),
  nodeLayer: getElement<HTMLElement>('node-layer'),
  connectionLayer: getElement<SVGSVGElement>('connection-layer'),
  searchInput: getElement<HTMLInputElement>('node-search'),
  suggestions: getElement<HTMLUListElement>('search-suggestions'),
  autosave: getElement<HTMLElement>('autosave-indicator'),
  undo: getElement<HTMLButtonElement>('btn-undo'),
  redo: getElement<HTMLButtonElement>('btn-redo'),
  json: getElement<HTMLTextAreaElement>('project-json'),
  export: getElement<HTMLButtonElement>('btn-export'),
  load: getElement<HTMLButtonElement>('btn-load'),
  runningToggle: getElement<HTMLInputElement>('running-toggle'),
  localeSelect: getElement<HTMLSelectElement>('locale-select'),
  readonlyBanner: getElement<HTMLElement>('readonly-banner'),
  queueRunning: getElement<HTMLElement>('queue-running'),
  queueQueued: getElement<HTMLElement>('queue-queued'),
  queueHistory: getElement<HTMLElement>('queue-history'),
  queueWarnings: getElement<HTMLElement>('queue-warnings'),
  crashConsent: getElement<HTMLInputElement>('crash-consent'),
  logPassword: getElement<HTMLInputElement>('log-password'),
  exportLogs: getElement<HTMLButtonElement>('btn-export-logs'),
  exportStatus: getElement<HTMLElement>('export-status'),
  inspectHistory: getElement<HTMLElement>('inspect-history'),
  connectionsList: getElement<HTMLUListElement>('connection-list'),
  connectionHint: getElement<HTMLElement>('connection-pending'),
  demoJob: getElement<HTMLButtonElement>('btn-demo-job'),
  cancelAll: getElement<HTMLButtonElement>('btn-cancel-all'),
  toast: getElement<HTMLElement>('toast'),
  aboutDistribution: getElement<HTMLElement>('about-distribution'),
  aboutLicense: getElement<HTMLElement>('about-license'),
  aboutPath: getElement<HTMLElement>('about-path'),
  aboutVersion: getElement<HTMLElement>('about-version'),
  aboutNotice: getElement<HTMLElement>('about-notice'),
  aboutLicenseLink: getElement<HTMLAnchorElement>('about-license-link'),
  aboutSourceLink: getElement<HTMLAnchorElement>('about-source-link')
});

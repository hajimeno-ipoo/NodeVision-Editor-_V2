import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildRendererHtml, type RendererPayload } from './ui-template';
import type { BootStatus, QueueWarning } from './types';

const now = new Date().toISOString();

const bootStatus: BootStatus = {
  settings: {
    schemaVersion: '1.0.7',
    tempRoot: '/tmp/nodevision',
    ffmpegPath: '/usr/bin/ffmpeg',
    ffprobePath: '/usr/bin/ffprobe',
    http: { enabled: false, tokenLabel: 'default', port: 3921 },
    presets: { videoBitrate: '8M', audioBitrate: '320k', container: 'mp4' },
    diagnostics: { lastTokenPreview: null, collectCrashDumps: false, lastLogExportPath: null },
    createdAt: now,
    updatedAt: now
  },
  ffmpeg: {
    ffmpeg: { path: '/usr/bin/ffmpeg', version: '6.1' },
    ffprobe: { path: '/usr/bin/ffprobe', version: '6.1' }
  },
  token: {
    label: 'default',
    value: 'abcd1234',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: now,
    updatedAt: now
  }
};

const basePayload: RendererPayload = {
  status: bootStatus,
  templates: [],
  nodes: [],
  queue: {
    active: [],
    queued: [],
    history: [],
    warnings: [],
    limits: { maxParallelJobs: 1, maxQueueLength: 4, queueTimeoutMs: 180_000 }
  },
  diagnostics: {
    collectCrashDumps: false,
    lastTokenPreview: null,
    lastLogExportPath: null,
    lastExportSha: null,
    inspectHistory: []
  }
};

const renderDom = (payload: RendererPayload) =>
  new JSDOM(buildRendererHtml(payload), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });

describe('ui-template queue warnings', () => {
  it('renders provided warnings list', async () => {
    const warnings: QueueWarning[] = [
      { type: 'QUEUE_FULL', level: 'warn', message: 'QueueFullError発生', occurredAt: '2025-01-02T00:00:00.000Z' }
    ];
    const dom = renderDom({
      ...basePayload,
      queue: { ...basePayload.queue, warnings }
    });

    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const warningNode = dom.window.document.querySelector('.queue-warning strong');
    expect(warningNode?.textContent).toBe('QUEUE_FULL');
    const message = dom.window.document.querySelector('.queue-warning span:nth-of-type(2)');
    expect(message?.textContent).toContain('QueueFullError発生');
    dom.window.close();
  });

  it('falls back to stable message when warnings are empty', async () => {
    const dom = renderDom(basePayload);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const stableNode = dom.window.document.querySelector('.queue-warning strong');
    expect(stableNode?.textContent).toBe('Queue Stable');
    dom.window.close();
  });
});

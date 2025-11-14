import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildRendererHtml, type RendererPayload } from './ui-template';
import type { BootStatus } from './types';

const now = new Date().toISOString();

const bootStatus: BootStatus = {
  settings: {
    schemaVersion: '1.0.7',
    tempRoot: '/tmp/nodevision',
    ffmpegPath: '/usr/bin/ffmpeg',
    ffprobePath: '/usr/bin/ffprobe',
    locale: 'en-US',
    http: { enabled: false, tokenLabel: 'default', port: 3921 },
    presets: { videoBitrate: '8M', audioBitrate: '320k', container: 'mp4' },
    diagnostics: { lastTokenPreview: null, collectCrashDumps: false, lastLogExportPath: null },
    createdAt: now,
    updatedAt: now
  },
  ffmpeg: {
    ffmpeg: { path: '/usr/bin/ffmpeg', version: '6.1', license: 'lgpl' },
    ffprobe: { path: '/usr/bin/ffprobe', version: '6.1', license: 'lgpl' }
  },
  token: {
    label: 'default',
    value: 'abcd1234',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: now,
    updatedAt: now
  },
  distribution: {
    ffmpeg: {
      origin: 'external',
      license: 'lgpl',
      licenseUrl: 'https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html',
      sourceUrl: 'https://ffmpeg.org/download.html#sources'
    }
  }
};

const sampleNodes = [
  {
    id: 'n1',
    typeId: 'loadMedia',
    nodeVersion: '1.0.0',
    title: 'Load',
    position: { x: 0, y: 0 },
    width: 200,
    height: 120,
    inputs: [],
    outputs: [{ id: 'media', label: 'Media', direction: 'output', dataType: 'video' }],
    searchTokens: ['load']
  },
  {
    id: 'n2',
    typeId: 'trim',
    nodeVersion: '1.0.0',
    title: 'Trim',
    position: { x: 160, y: 0 },
    width: 200,
    height: 120,
    inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
    outputs: [{ id: 'result', label: 'Result', direction: 'output', dataType: 'video' }],
    searchTokens: ['trim']
  }
];

const basePayload: RendererPayload = {
  status: bootStatus,
  templates: [],
  nodes: sampleNodes,
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
  },
  connections: []
};

const renderDom = (payload: RendererPayload) =>
  new JSDOM(buildRendererHtml(payload), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });

const loadAxe = async () => (await import('axe-core')).default;

describe('ui-template axe check', () => {
  it('keeps WCAG AA violations within threshold', async () => {
    const dom = renderDom(basePayload);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const globalRecord = globalThis as Record<string, unknown>;
    const previousGlobals = {
      window: globalRecord.window,
      document: globalRecord.document,
      Node: globalRecord.Node
    };

    try {
      globalRecord.window = dom.window;
      globalRecord.document = dom.window.document;
      globalRecord.Node = dom.window.Node;

      const axe = await loadAxe();
      const { violations } = await axe.run(dom.window.document, {
        runOnly: { type: 'tag', values: ['wcag2aa'] }
      });
      expect(violations.length).toBeLessThanOrEqual(5);
    } finally {
      dom.window.close();
      if (typeof previousGlobals.window === 'undefined') delete globalRecord.window;
      else globalRecord.window = previousGlobals.window;

      if (typeof previousGlobals.document === 'undefined') delete globalRecord.document;
      else globalRecord.document = previousGlobals.document;

      if (typeof previousGlobals.Node === 'undefined') delete globalRecord.Node;
      else globalRecord.Node = previousGlobals.Node;
    }
  });
});

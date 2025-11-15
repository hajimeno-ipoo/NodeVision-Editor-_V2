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
  },
  connections: []
};

const renderDom = (payload: RendererPayload) =>
  new JSDOM(buildRendererHtml(payload), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });

const ensurePointerEventPolyfill = (dom: JSDOM) => {
  if (dom.window.PointerEvent) {
    return;
  }
  class PointerEventPolyfill extends dom.window.MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  // @ts-expect-error jsdom does not define PointerEvent by default
  dom.window.PointerEvent = PointerEventPolyfill;
};

const stubRect = (el: Element | null, rect: { left: number; top: number; width: number; height: number }) => {
  if (!el) return;
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height
    })
  });
};

const MEDIA_NODES = [
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
    position: { x: 200, y: 0 },
    width: 200,
    height: 120,
    inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
    outputs: [{ id: 'result', label: 'Result', direction: 'output', dataType: 'video' }],
    searchTokens: ['trim']
  }
] as const;

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
    const message = dom.window.document.querySelector('.queue-warning span:nth-of-type(1)');
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

describe('ui-template i18n', () => {
  it('applies ja-JP translations when locale is configured', async () => {
    const dom = renderDom({
      ...basePayload,
      status: {
        ...bootStatus,
        settings: { ...bootStatus.settings, locale: 'ja-JP' }
      }
    });

    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    expect(dom.window.document.documentElement.lang).toBe('ja-JP');
    const searchLabel = dom.window.document.querySelector('.search-box span');
    expect(searchLabel?.textContent).toBe('ノード検索');
    dom.window.close();
  });
});

describe('ui-template accessibility helpers', () => {

  it('renders connection entries with labels', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: MEDIA_NODES,
      connections: [{ id: 'c1', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' }]
    });

    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const entry = dom.window.document.querySelector('.connections-list li span');
    expect(entry?.textContent).toBe('Load Media • Media → Trim • Source');
    dom.window.close();
  });

  it('applies aria metadata to nodes and ports', async () => {
    const dom = renderDom({ ...basePayload, nodes: MEDIA_NODES });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const node = dom.window.document.querySelector('.node');
    expect(node?.getAttribute('role')).toBe('group');
    const port = dom.window.document.querySelector('.port');
    expect(port?.getAttribute('aria-label')).toContain('port');
    dom.window.close();
  });
});

describe('ui-template connections layer', () => {
  it('renders SVG curves for stored connections', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: MEDIA_NODES,
      connections: [{ id: 'c-svg', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' }]
    });

    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const paths = dom.window.document.querySelectorAll('#connection-layer path');
    expect(paths.length).toBeGreaterThan(0);
    dom.window.close();
  });

  it('connects ports via pointer drag', async () => {
    const dom = renderDom({ ...basePayload, nodes: MEDIA_NODES });
    ensurePointerEventPolyfill(dom);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const doc = dom.window.document;
    const canvas = doc.getElementById('canvas');
    stubRect(canvas, { left: 0, top: 0, width: 900, height: 600 });
    const output = doc.querySelector('.port[data-node-id="n1"][data-port-id="media"]');
    const input = doc.querySelector('.port[data-node-id="n2"][data-port-id="source"]');
    stubRect(output, { left: 120, top: 240, width: 24, height: 24 });
    stubRect(input, { left: 420, top: 260, width: 24, height: 24 });
    stubRect(output?.querySelector('.port-dot'), { left: 126, top: 246, width: 12, height: 12 });
    stubRect(input?.querySelector('.port-dot'), { left: 426, top: 266, width: 12, height: 12 });

    output?.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', { pointerId: 5, button: 0, clientX: 136, clientY: 252, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.PointerEvent('pointermove', { pointerId: 5, clientX: 360, clientY: 270, bubbles: true })
    );
    input?.dispatchEvent(new dom.window.PointerEvent('pointerenter', { pointerId: 5, bubbles: true }));
    dom.window.dispatchEvent(new dom.window.PointerEvent('pointerup', { pointerId: 5, bubbles: true }));

    const rows = doc.querySelectorAll('.connections-list li');
    expect(rows.length).toBe(1);
    dom.window.close();
  });
});

describe('ui-template about card', () => {
  it('renders external FFmpeg details and notice', async () => {
    const dom = renderDom(basePayload);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const distribution = dom.window.document.getElementById('about-distribution');
    expect(distribution?.textContent).toContain('External');
    const notice = dom.window.document.getElementById('about-notice');
    expect(notice?.textContent).toContain('LGPL');
    dom.window.close();
  });

  it('respects bundled metadata links', async () => {
    const dom = renderDom({
      ...basePayload,
      status: {
        ...basePayload.status,
        distribution: {
          ffmpeg: {
            origin: 'bundled',
            license: 'lgpl',
            licenseUrl: 'https://example.com/license',
            sourceUrl: 'https://example.com/source'
          }
        }
      }
    });

    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const licenseLink = dom.window.document.getElementById('about-license-link');
    expect(licenseLink?.getAttribute('href')).toBe('https://example.com/license');
    const sourceLink = dom.window.document.getElementById('about-source-link');
    expect(sourceLink?.getAttribute('href')).toBe('https://example.com/source');
    dom.window.close();
  });
});

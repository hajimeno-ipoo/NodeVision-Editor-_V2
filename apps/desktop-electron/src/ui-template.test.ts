import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import type { BootStatus, QueueWarning } from './types';
import { buildRendererHtml, type RendererPayload } from './ui-template';

const now = new Date().toISOString();

const bootStatus: BootStatus = {
  settings: {
    schemaVersion: '1.0.7',
    tempRoot: '/tmp/nodevision',
    ffmpegPath: '/usr/bin/ffmpeg',
    ffprobePath: '/usr/bin/ffprobe',
    locale: 'ja-JP',
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
  (dom.window as typeof dom.window & { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill as unknown as typeof dom.window.PointerEvent;
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

const MEDIA_NODES: RendererPayload['nodes'] = [
  {
    id: 'n1',
    typeId: 'loadImage',
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
];

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
    expect(stableNode?.textContent).toBe('キューは安定');
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

describe('canvas controls', () => {
  it('renders pan/select tools and zoom dropdown with defaults', async () => {
    const dom = renderDom(basePayload);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const grid = dom.window.document.getElementById('canvas-grid');
    expect(grid?.getAttribute('aria-hidden')).toBe('true');
    const selectBtn = dom.window.document.getElementById('tool-select');
    expect(selectBtn?.getAttribute('data-i18n-attr-title')).toBe('canvas.toolSelectTooltip');
    const panBtn = dom.window.document.getElementById('tool-pan');
    expect(panBtn?.getAttribute('data-i18n-attr-title')).toBe('canvas.toolPanTooltip');
    const zoomDisplay = dom.window.document.getElementById('zoom-display');
    expect(zoomDisplay?.textContent?.trim()).toBe('100%');
    const zoomMenu = dom.window.document.getElementById('zoom-menu');
    expect(zoomMenu?.getAttribute('aria-hidden')).toBe('true');
    const zoomIn = dom.window.document.getElementById('zoom-in');
    expect(zoomIn?.textContent).toContain('⌥+〜');
    const zoomInput = dom.window.document.getElementById('zoom-input') as HTMLInputElement | null;
    expect(zoomInput?.placeholder).toBe('例: 150');
    dom.window.close();
  });
});

describe('load media node UI', () => {
  it('renders picker controls and hidden input', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: MEDIA_NODES
    });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const picker = dom.window.document.querySelector<HTMLInputElement>('.node-media-upload input[type="file"]');
    expect(picker?.type).toBe('file');
    const uploadLabel = dom.window.document.querySelector('.node-media-upload');
    expect(uploadLabel?.textContent).toContain('アップロードするファイルを選択');
    const fileInput = dom.window.document.querySelector<HTMLInputElement>('.node-media-upload input[type="file"]');
    expect(fileInput).toBeTruthy();
    const placeholder = dom.window.document.querySelector('.node-media-empty');
    expect(placeholder?.textContent).toBe('まだメディアが選ばれていません');
    dom.window.close();
  });

  it('renders delete actions for nodes', async () => {
    const dom = renderDom({ ...basePayload, nodes: MEDIA_NODES });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const deleteBtn = dom.window.document.querySelector<HTMLButtonElement>('.node-delete-btn');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn?.getAttribute('aria-label')).toBe('ノードを削除');
    dom.window.close();
  });

  it('sets accept attribute based on node type', async () => {
    const nodes = [
      ...MEDIA_NODES,
      {
        id: 'n3',
        typeId: 'loadVideo',
        nodeVersion: '1.0.0',
        title: 'Load Video',
        position: { x: 400, y: 0 },
        width: 200,
        height: 120,
        inputs: [],
        outputs: [{ id: 'media', label: 'Media', direction: 'output', dataType: 'video' }],
        searchTokens: ['load', 'video']
      }
    ];
    const dom = renderDom({ ...basePayload, nodes });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const imageInput = dom.window.document.querySelector<HTMLInputElement>('.node[data-id="n1"] .node-media-upload input');
    const videoInput = dom.window.document.querySelector<HTMLInputElement>('.node[data-id="n3"] .node-media-upload input');
    expect(imageInput?.accept).toBe('image/*');
    expect(videoInput?.accept).toBe('video/*');
    dom.window.close();
  });

  it('exposes node type metadata for styling hooks', async () => {
    const dom = renderDom({ ...basePayload, nodes: MEDIA_NODES });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const nodeEl = dom.window.document.querySelector('.node[data-id="n1"]');
    expect(nodeEl?.getAttribute('data-type-id')).toBe('loadImage');
    expect(nodeEl?.classList.contains('node-type-loadimage')).toBe(true);
    dom.window.close();
  });

  it('renders node info cards with input status for downstream nodes', async () => {
    const dom = renderDom({ ...basePayload, nodes: MEDIA_NODES });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const info = dom.window.document.querySelector('.node[data-id="n2"] .node-info');
    expect(info).toBeTruthy();
    expect(info?.textContent).toContain('IN/OUT間で素材をカット');
    const status = info?.querySelector('.node-status');
    expect(status?.textContent).toContain('ソース');
    expect(status?.textContent).toContain('未接続');
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
    expect(entry?.textContent).toBe('画像を読み込み • 画像 → トリム • ソース');
    dom.window.close();
  });

  it('applies aria metadata to nodes and ports', async () => {
    const dom = renderDom({ ...basePayload, nodes: MEDIA_NODES });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const node = dom.window.document.querySelector('.node');
    expect(node?.getAttribute('role')).toBe('group');
    const port = dom.window.document.querySelector('.port');
    expect(port?.getAttribute('aria-label')).toContain('ポート');
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

  it('highlights selected connection when checkbox is toggled', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: MEDIA_NODES,
      connections: [{ id: 'c-highlight', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' }]
    });
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const doc = dom.window.document;
    const canvas = doc.getElementById('canvas');
    stubRect(canvas, { left: 0, top: 0, width: 900, height: 600 });
    const output = doc.querySelector('.port[data-node-id="n1"][data-port-id="media"]');
    const input = doc.querySelector('.port[data-node-id="n2"][data-port-id="source"]');
    stubRect(output, { left: 120, top: 240, width: 24, height: 24 });
    stubRect(input, { left: 420, top: 260, width: 24, height: 24 });
    const outputDot = output?.querySelector('.port-dot') ?? null;
    const inputDot = input?.querySelector('.port-dot') ?? null;
    stubRect(outputDot, { left: 126, top: 246, width: 12, height: 12 });
    stubRect(inputDot, { left: 426, top: 266, width: 12, height: 12 });

    const checkbox = doc.querySelector<HTMLInputElement>('input[data-connection-check="c-highlight"]');
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const highlighted = doc.querySelector('#connection-layer path.connection-highlight');
    expect(highlighted).toBeTruthy();
    const highlightedNode = doc.querySelector('.node.node-highlight');
    expect(highlightedNode).toBeTruthy();
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
    const dragOutputDot = output?.querySelector('.port-dot') ?? null;
    const dragInputDot = input?.querySelector('.port-dot') ?? null;
    stubRect(dragOutputDot, { left: 126, top: 246, width: 12, height: 12 });
    stubRect(dragInputDot, { left: 426, top: 266, width: 12, height: 12 });

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

  it('drops a dragged curve on canvas to remove an existing connection', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: MEDIA_NODES,
      connections: [{ id: 'c-detach', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' }]
    });
    ensurePointerEventPolyfill(dom);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const doc = dom.window.document;
    const canvas = doc.getElementById('canvas');
    stubRect(canvas, { left: 0, top: 0, width: 900, height: 600 });
    const output = doc.querySelector<HTMLElement>('.port[data-node-id="n1"][data-port-id="media"]');
    const input = doc.querySelector<HTMLElement>('.port[data-node-id="n2"][data-port-id="source"]');
    stubRect(output, { left: 120, top: 240, width: 24, height: 24 });
    const detachOutputDot = output?.querySelector('.port-dot') ?? null;
    stubRect(detachOutputDot, { left: 126, top: 246, width: 12, height: 12 });
    stubRect(input, { left: 420, top: 260, width: 24, height: 24 });

    input?.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', { pointerId: 7, button: 0, clientX: 420, clientY: 260, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.PointerEvent('pointermove', { pointerId: 7, clientX: 560, clientY: 320, bubbles: true })
    );
    dom.window.dispatchEvent(new dom.window.PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const firstRow = doc.querySelector('.connections-list li');
    const jsonValue = (doc.getElementById('project-json') as HTMLTextAreaElement | null)?.value ?? '{}';
    const project = JSON.parse(jsonValue);
    expect(project.connections.length).toBe(0);
    expect(firstRow?.classList.contains('connections-empty')).toBe(true);
    dom.window.close();
  });

  it('keeps other outputs intact when removing a single connection via input drag', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: [
        ...MEDIA_NODES,
        {
          id: 'n3',
          typeId: 'resize',
          nodeVersion: '1.0.0',
          title: 'Resize',
          position: { x: 420, y: 200 },
          width: 200,
          height: 120,
          inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
          outputs: [],
          searchTokens: ['resize']
        }
      ],
      connections: [
        { id: 'c-left', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' },
        { id: 'c-right', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n3', toPortId: 'source' }
      ]
    });
    ensurePointerEventPolyfill(dom);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const doc = dom.window.document;
    const canvas = doc.getElementById('canvas');
    stubRect(canvas, { left: 0, top: 0, width: 900, height: 600 });
    const sourceInput = doc.querySelector<HTMLElement>('.port[data-node-id="n2"][data-port-id="source"]');
    stubRect(sourceInput, { left: 360, top: 240, width: 24, height: 24 });

    sourceInput?.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', { pointerId: 11, button: 0, clientX: 360, clientY: 240, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.PointerEvent('pointermove', { pointerId: 11, clientX: 520, clientY: 300, bubbles: true })
    );
    dom.window.dispatchEvent(new dom.window.PointerEvent('pointerup', { pointerId: 11, bubbles: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const rows = doc.querySelectorAll('.connections-list li');
    expect(rows.length).toBe(1);
    const jsonValue = (doc.getElementById('project-json') as HTMLTextAreaElement | null)?.value ?? '{}';
    const project = JSON.parse(jsonValue);
    expect(project.connections.length).toBe(1);
    expect(project.connections[0].toNodeId).toBe('n3');
    dom.window.close();
  });

  it('rewires a connection by dragging from an input to another node', async () => {
    const nodes: RendererPayload['nodes'] = [
      ...MEDIA_NODES,
      {
        id: 'n3',
        typeId: 'resize',
        nodeVersion: '1.0.0',
        title: 'Resize',
        position: { x: 420, y: 200 },
        width: 200,
        height: 120,
        inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
        outputs: [],
        searchTokens: ['resize']
      }
    ];
    const dom = renderDom({
      ...basePayload,
      nodes,
      connections: [{ id: 'c-rewire', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' }]
    });
    ensurePointerEventPolyfill(dom);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const doc = dom.window.document;
    const canvas = doc.getElementById('canvas');
    stubRect(canvas, { left: 0, top: 0, width: 900, height: 600 });
    const output = doc.querySelector<HTMLElement>('.port[data-node-id="n1"][data-port-id="media"]');
    const sourceInput = doc.querySelector<HTMLElement>('.port[data-node-id="n2"][data-port-id="source"]');
    const newInput = doc.querySelector<HTMLElement>('.port[data-node-id="n3"][data-port-id="source"]');
    stubRect(output, { left: 120, top: 240, width: 24, height: 24 });
    const rewireOutputDot = output?.querySelector('.port-dot') ?? null;
    stubRect(rewireOutputDot, { left: 126, top: 246, width: 12, height: 12 });
    stubRect(sourceInput, { left: 360, top: 240, width: 24, height: 24 });
    stubRect(newInput, { left: 620, top: 240, width: 24, height: 24 });

    sourceInput?.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', { pointerId: 8, button: 0, clientX: 360, clientY: 240, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.PointerEvent('pointermove', { pointerId: 8, clientX: 640, clientY: 260, bubbles: true })
    );
    newInput?.dispatchEvent(new dom.window.PointerEvent('pointerenter', { pointerId: 8, bubbles: true }));
    dom.window.dispatchEvent(new dom.window.PointerEvent('pointerup', { pointerId: 8, bubbles: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const entry = doc.querySelector('.connections-list li span')?.textContent ?? '';
    expect(entry).toContain('リサイズ');
    const jsonValue = (doc.getElementById('project-json') as HTMLTextAreaElement | null)?.value ?? '{}';
    const project = JSON.parse(jsonValue);
    expect(project.connections[0].toNodeId).toBe('n3');
    dom.window.close();
  });

  it('cancels a second connection drag without removing the existing one', async () => {
    const dom = renderDom({
      ...basePayload,
      nodes: MEDIA_NODES,
      connections: [{ id: 'c-single', fromNodeId: 'n1', fromPortId: 'media', toNodeId: 'n2', toPortId: 'source' }]
    });
    ensurePointerEventPolyfill(dom);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const doc = dom.window.document;
    const canvas = doc.getElementById('canvas');
    stubRect(canvas, { left: 0, top: 0, width: 900, height: 600 });
    const output = doc.querySelector<HTMLElement>('.port[data-node-id="n1"][data-port-id="media"]');
    stubRect(output, { left: 120, top: 240, width: 24, height: 24 });
    const cancelOutputDot = output?.querySelector('.port-dot') ?? null;
    stubRect(cancelOutputDot, { left: 126, top: 246, width: 12, height: 12 });

    output?.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', { pointerId: 12, button: 0, clientX: 136, clientY: 252, bubbles: true })
    );
    dom.window.dispatchEvent(
      new dom.window.PointerEvent('pointermove', { pointerId: 12, clientX: 360, clientY: 260, bubbles: true })
    );
    dom.window.dispatchEvent(new dom.window.PointerEvent('pointerup', { pointerId: 12, bubbles: true }));
    await new Promise(resolve => dom.window.setTimeout(resolve, 0));
    const rows = doc.querySelectorAll('.connections-list li');
    expect(rows.length).toBe(1);
    const jsonValue = (doc.getElementById('project-json') as HTMLTextAreaElement | null)?.value ?? '{}';
    const project = JSON.parse(jsonValue);
    expect(project.connections.length).toBe(1);
    expect(project.connections[0].toNodeId).toBe('n2');
    dom.window.close();
  });
});

describe('ui-template about card', () => {
  it('renders external FFmpeg details and notice', async () => {
    const dom = renderDom(basePayload);
    await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
    const distribution = dom.window.document.getElementById('about-distribution');
    expect(distribution?.textContent).toContain('外部');
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

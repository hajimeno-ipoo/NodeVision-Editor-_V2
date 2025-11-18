const fs = require('node:fs');
const path = require('node:path');
const { buildRendererHtml } = require('../apps/desktop-electron/dist/ui-template.js');

const now = new Date().toISOString();

const payload = {
  status: {
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
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
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
  },
  templates: [
    {
      typeId: 'load',
      nodeVersion: '1.0.0',
      title: 'Load Media',
      category: 'Input',
      description: 'Import image/video files',
      keywords: ['load', 'input'],
      outputs: [{ id: 'media', label: 'Media', direction: 'output', dataType: 'video' }]
    },
    {
      typeId: 'trim',
      nodeVersion: '1.0.0',
      title: 'Trim',
      category: 'Edit',
      description: 'Set in/out points',
      keywords: ['trim'],
      inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
      outputs: [{ id: 'result', label: 'Result', direction: 'output', dataType: 'video' }]
    },
    {
      typeId: 'preview',
      nodeVersion: '1.0.0',
      title: 'Preview',
      category: 'Output',
      description: 'Preview media',
      keywords: ['preview'],
      inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }]
    }
  ],
  nodes: [
    {
      id: 'n-load',
      typeId: 'loadImage',
      nodeVersion: '1.0.0',
      title: 'Load',
      position: { x: 0, y: 0 },
      width: 220,
      height: 120,
      inputs: [],
      outputs: [{ id: 'media', label: 'Media', direction: 'output', dataType: 'video' }],
      searchTokens: ['load']
    },
    {
      id: 'n-trim',
      typeId: 'trim',
      nodeVersion: '1.0.0',
      title: 'Trim',
      position: { x: 280, y: 40 },
      width: 220,
      height: 140,
      inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
      outputs: [{ id: 'result', label: 'Result', direction: 'output', dataType: 'video' }],
      searchTokens: ['trim']
    },
    {
      id: 'n-preview',
      typeId: 'mediaPreview',
      nodeVersion: '1.0.0',
      title: 'Preview',
      position: { x: 580, y: -20 },
      width: 240,
      height: 160,
      inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
      outputs: [],
      searchTokens: ['preview']
    }
  ],
  connections: [
    { id: 'c1', fromNodeId: 'n-load', fromPortId: 'media', toNodeId: 'n-trim', toPortId: 'source' },
    { id: 'c2', fromNodeId: 'n-trim', fromPortId: 'result', toNodeId: 'n-preview', toPortId: 'source' }
  ],
  queue: {
    active: [],
    queued: [],
    history: [],
    warnings: [],
    limits: { maxParallelJobs: 1, maxQueueLength: 4, queueTimeoutMs: 180000 }
  },
  diagnostics: {
    collectCrashDumps: false,
    lastTokenPreview: null,
    lastLogExportPath: null,
    lastExportSha: null,
    inspectHistory: []
  }
};

const html = buildRendererHtml(payload);
const outPath = path.resolve(__dirname, 'nodevision-preview.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Wrote preview to', outPath);

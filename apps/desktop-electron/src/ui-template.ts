import fs from 'node:fs';
import path from 'node:path';

import type { EditorNode, NodeConnection, NodeTemplate } from '@nodevision/editor';

import type { BootStatus, DiagnosticsSnapshot, QueueSnapshot } from './types';

export interface RendererPayload {
  status: BootStatus;
  templates: NodeTemplate[];
  nodes: EditorNode[];
  queue: QueueSnapshot;
  diagnostics: DiagnosticsSnapshot;
  connections: NodeConnection[];
}

import { UI_TRANSLATIONS } from './renderer/i18n';



type SupportedLocale = keyof typeof UI_TRANSLATIONS;
const DEFAULT_LOCALE: SupportedLocale = 'ja-JP';

type TypescriptModule = typeof import('typescript');

let rendererScriptCache: string | null = null;
let cachedTypescript: TypescriptModule | null = null;

const encodePayload = (payload: RendererPayload): string =>
  encodeURIComponent(JSON.stringify(payload));

const TRANSLATIONS_EMBED = JSON.stringify(UI_TRANSLATIONS);
const SUPPORTED_LOCALES_EMBED = JSON.stringify(Object.keys(UI_TRANSLATIONS));

const resolveFirstExistingPath = (candidates: string[]): string | null => {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const loadTypescriptModule = (): TypescriptModule => {
  if (cachedTypescript) {
    return cachedTypescript;
  }
  try {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    cachedTypescript = require('typescript');
  } catch (error) {
    throw new Error(
      'TypeScript compiler is required to inline renderer scripts. Run `pnpm --filter desktop-electron build` first.'
    );
  }
  if (!cachedTypescript) {
    throw new Error('Unable to load TypeScript module');
  }
  return cachedTypescript;
};

const stripSourceMapComment = (source: string): string =>
  source.replace(/\/\/\#\s*sourceMappingURL=.*$/gm, '');

const escapeClosingScriptTag = (source: string): string => source.replace(/<\/script>/gi, '<\\/script>');

const indentRendererScript = (source: string): string =>
  escapeClosingScriptTag(source)
    .split('\n')
    .map(line => (line ? `      ${line}` : ''))
    .join('\n');

const buildInlineBundle = (moduleDir: string, extension: '.js' | '.ts'): string => {
  const ts = extension === '.ts' ? loadTypescriptModule() : null;
  const moduleEntries = fs
    .readdirSync(moduleDir)
    .filter(file => file.endsWith(extension) && !file.endsWith('.d.ts'))
    .sort()
    .map(file => {
      const moduleId = `./${path.basename(file, extension)}`;
      const absolutePath = path.join(moduleDir, file);
      let code = fs.readFileSync(absolutePath, 'utf8');
      if (extension === '.ts' && ts) {
        code = ts.transpileModule(code, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020
          }
        }).outputText;
      }
      const body = stripSourceMapComment(code);
      return `  '${moduleId}': function (exports, require, module) {\n${body}\n  }`;
    })
    .join(',\n');

  return stripSourceMapComment(`(function(){\n  const modules = {\n${moduleEntries}\n  };\n  const cache = {};\n  const require = id => {\n    if (!modules[id]) {\n      throw new Error('Renderer module not found: ' + id);\n    }\n    if (cache[id]) {\n      return cache[id].exports;\n    }\n    const module = { exports: {} };\n    cache[id] = module;\n    modules[id](module.exports, require, module);\n    return module.exports;\n  };\n  require('./app');\n})();`);
};

const loadRendererBundle = (): string => {
  if (rendererScriptCache) {
    return rendererScriptCache;
  }

  const jsPath = resolveFirstExistingPath([
    path.resolve(__dirname, 'renderer', 'app.js'),
    path.resolve(__dirname, '..', 'dist', 'renderer', 'app.js')
  ]);
  if (jsPath) {
    rendererScriptCache = buildInlineBundle(path.dirname(jsPath), '.js');
    return rendererScriptCache;
  }

  const tsPath = resolveFirstExistingPath([
    path.resolve(__dirname, 'renderer', 'app.ts'),
    path.resolve(__dirname, '..', 'src', 'renderer', 'app.ts')
  ]);
  if (tsPath) {
    rendererScriptCache = buildInlineBundle(path.dirname(tsPath), '.ts');
    return rendererScriptCache;
  }

  throw new Error(
    'Renderer bundle not found. Run `pnpm --filter desktop-electron build` to emit apps/desktop-electron/dist/renderer/app.js.'
  );
};

const buildRendererScripts = (encodedPayload: string): string => {
  const bootstrapScript = [
    '    <script>',
    `      window.__NODEVISION_BOOTSTRAP__ = JSON.parse(decodeURIComponent('${encodedPayload}'));`,
    `      window.__NODEVISION_TRANSLATIONS__ = ${TRANSLATIONS_EMBED};`,
    `      window.__NODEVISION_SUPPORTED_LOCALES__ = ${SUPPORTED_LOCALES_EMBED};`,
    `      window.__NODEVISION_FALLBACK_LOCALE__ = '${DEFAULT_LOCALE}';`,
    '    </script>'
  ].join('\n');

  const rendererTag = ['    <script>', indentRendererScript(loadRendererBundle()), '    </script>'].join('\n');

  return `${bootstrapScript}\n${rendererTag}`;
};

export const buildRendererHtml = (payload: RendererPayload): string => {
  const encoded = encodePayload(payload);
  const scriptTags = buildRendererScripts(encoded);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title data-i18n-key="app.title">NodeVision Editor</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background-color: #0b0c10;
        color: #f5f7fb;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background: #101114;
        color: #f2f3f7;
      }
      header {
        padding: 16px 24px;
        background: linear-gradient(180deg, #1e2026, #17191f);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        align-items: center;
      }
      header ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
      }
      main {
        flex: 1;
        display: grid;
        grid-template-columns: 320px 1fr;
        min-height: 0;
      }
      .sidebar {
        border-right: 1px solid rgba(255, 255, 255, 0.04);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: linear-gradient(180deg, #141518, #101113);
      }
      .canvas-wrap {
        position: relative;
        overflow: hidden;
      }
      #canvas {
        position: absolute;
        inset: 0;
        background-color: #16171c;
        background-image: linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px);
        background-size: 8px 8px;
        cursor: grab;
        transform-origin: 0 0;
      }
      #canvas.zooming {
        cursor: zoom-in;
      }
      #node-layer,
      #connection-layer {
        position: absolute;
        inset: 0;
      }
      #node-layer {
        min-height: 100%;
      }
      #connection-layer {
        pointer-events: none;
        overflow: visible;
      }
      .node {
        position: absolute;
        border-radius: 18px;
        padding: 0 0 14px;
        min-width: 240px;
        background: linear-gradient(180deg, #fafafa, #e6e6ea);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 0 12px 34px rgba(78, 86, 107, 0.35);
        color: #2b2c31;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: hidden;
        transition: border 160ms ease, box-shadow 160ms ease, transform 160ms ease;
      }
      .node-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px 18px 6px;
        background: linear-gradient(180deg, #fefefe, #ececef);
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }
      .node-title {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.01em;
        color: #1f1f24;
      }
      .node-meta {
        margin: 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(48, 48, 60, 0.5);
      }
      .node-description {
        margin: 0;
        font-size: 12px;
        color: rgba(48, 48, 60, 0.7);
      }
      .node-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 11px;
        background: rgba(97, 97, 110, 0.15);
        color: rgba(48, 48, 60, 0.85);
      }
      .node.selected {
        border-color: #7dc3ff;
        box-shadow: 0 0 0 2px rgba(125, 195, 255, 0.35);
      }
      @keyframes nodeGlow {
        0% {
          border-color: rgba(255, 223, 107, 0.65);
          box-shadow: 0 0 12px rgba(255, 223, 107, 0.35);
        }
        100% {
          border-color: rgba(255, 244, 201, 1);
          box-shadow: 0 0 28px rgba(255, 244, 201, 0.95);
        }
      }
      .node-highlight {
        animation: nodeGlow 1.2s ease-in-out infinite alternate;
      }
      .node-ports {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 4px 18px 0;
      }
      button, .pill-button {
        border: none;
        border-radius: 999px;
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-size: 13px;
        cursor: pointer;
        transition: background 120ms ease;
      }
      button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      button:hover:not(:disabled), .pill-button:hover:not(.disabled) {
        background: rgba(255, 255, 255, 0.18);
      }
      .toolbar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .toolbar-group {
        display: inline-flex;
        gap: 4px;
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 999px;
      }
      .locale-group {
        align-items: center;
        gap: 8px;
      }
      .locale-group label {
        font-size: 12px;
        letter-spacing: 0.01em;
      }
      .locale-group select {
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(5, 7, 12, 0.9);
        color: inherit;
        padding: 4px 10px;
        font-size: 12px;
      }
      .search-box input {
        width: 100%;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(12, 15, 23, 0.8);
        color: inherit;
        font-size: 14px;
      }
      .suggestions {
        list-style: none;
        padding: 0;
        margin: 8px 0 0;
        max-height: 180px;
        overflow: auto;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(8, 10, 16, 0.9);
      }
      .suggestions li {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        cursor: pointer;
      }
      .suggestions li:last-child {
        border-bottom: none;
      }
      .suggestions li.active {
        background: rgba(78, 158, 255, 0.16);
      }
      .help-card {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 16px;
        background: rgba(13, 16, 25, 0.9);
        font-size: 13px;
      }
      .queue-card,
      .diagnostics-card,
      .connections-card {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 16px;
        background: rgba(13, 16, 25, 0.85);
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 12px;
      }
      .queue-card header,
      .diagnostics-card header,
      .connections-card header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .about-card {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 16px;
        background: rgba(13, 16, 25, 0.85);
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
      }
      .about-card header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .about-card dl {
        margin: 0;
      }
      .about-card dt {
        font-size: 10px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.6);
      }
      .about-card dd {
        margin: 2px 0 10px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
      }
      .about-card .mono {
        font-family: 'JetBrains Mono', 'SFMono-Regular', monospace;
        word-break: break-all;
      }
      .about-links {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .about-links a {
        color: #88b6ff;
        font-size: 12px;
      }
      .queue-lists {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .queue-section {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px;
      }
      .queue-section strong {
        font-size: 11px;
        letter-spacing: 0.02em;
      }
      .queue-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2px 0;
      }
      .queue-badge {
        display: inline-flex;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        font-size: 11px;
      }
      .connections-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
      }
      .connections-list li {
        display: block;
      }
      .connection-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .connection-row input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: #ffd166;
        cursor: pointer;
      }
      .connection-row span {
        flex: 1;
      }
      .connection-row input[type="checkbox"]:checked + span {
        color: #ffe6a1;
      }
      .connections-list .connections-empty {
        opacity: 0.7;
      }
      .pending-hint {
        font-size: 11px;
        color: #ffd166;
      }
      .ports {
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1;
      }
      .ports.inputs,
      .ports.outputs {
        align-items: stretch;
      }
      .port {
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        padding: 8px 14px;
        background: linear-gradient(180deg, #dedee3, #cdced6);
        color: #2b2c33;
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 140px;
        justify-content: space-between;
        transition: border 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }
      .port.input {
        flex-direction: row;
        text-align: left;
      }
      .port.output {
        flex-direction: row-reverse;
        text-align: right;
      }
      .port-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .port.output .port-text {
        align-items: flex-end;
      }
      .port-label {
        font-weight: 600;
        font-size: 13px;
        color: #232329;
      }
      .port-type {
        font-size: 11px;
        color: rgba(34, 34, 40, 0.6);
        display: block;
      }
      .port:focus-visible {
        outline: 2px solid #4e9eff;
        outline-offset: 2px;
      }
      .port-dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 2px solid rgba(66, 66, 88, 0.4);
        background: rgba(66, 66, 88, 0.2);
        box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.15);
        flex-shrink: 0;
      }
      .port-connected {
        border-color: rgba(143, 160, 228, 0.8);
        box-shadow: 0 0 0 2px rgba(143, 160, 228, 0.25);
      }
      .port-connected .port-dot {
        background: rgba(143, 160, 228, 0.6);
      }
      .port-pending {
        border-color: rgba(255, 209, 102, 0.9);
        box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.4);
      }
      .port-drop-target {
        border-color: rgba(126, 194, 255, 0.85);
        box-shadow: 0 0 0 2px rgba(126, 194, 255, 0.35), 0 0 18px rgba(126, 194, 255, 0.25);
      }
      .port-drop-target .port-dot {
        border-color: rgba(126, 194, 255, 0.9);
        background: rgba(126, 194, 255, 0.35);
      }
      .port-placeholder {
        font-size: 12px;
        color: rgba(47, 48, 55, 0.5);
      }
      #connection-layer path {
        fill: none;
        stroke: rgba(186, 199, 227, 0.9);
        stroke-width: 4px;
        stroke-linecap: round;
        filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35));
      }
      @keyframes connectionGlow {
        0% {
          stroke-width: 4px;
          stroke: rgba(255, 223, 107, 0.85);
          filter: drop-shadow(0 0 8px rgba(255, 223, 107, 0.45));
        }
        100% {
          stroke-width: 8px;
          stroke: rgba(255, 244, 201, 1);
          filter: drop-shadow(0 0 22px rgba(255, 244, 201, 0.95));
        }
      }
      #connection-layer path.connection-highlight {
        stroke: rgba(255, 244, 201, 1);
        animation: connectionGlow 1.2s ease-in-out infinite alternate;
      }
      #connection-layer .connection-preview {
        stroke: rgba(255, 209, 102, 0.9);
        stroke-dasharray: 8 6;
      }
      .pill-button.pill-danger {
        border: 1px solid rgba(255, 82, 82, 0.55);
        background: rgba(255, 82, 82, 0.15);
      }
      .queue-alerts {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px;
        background: rgba(255, 183, 77, 0.08);
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
      }
      .queue-warning {
        display: flex;
        flex-direction: column;
        gap: 2px;
        border-left: 3px solid rgba(255, 255, 255, 0.2);
        padding-left: 8px;
      }
      .queue-warning strong {
        font-size: 11px;
        letter-spacing: 0.05em;
      }
      .queue-warning-warn {
        border-left-color: #ffb347;
      }
      .queue-warning-error {
        border-left-color: #ff5e7a;
      }
      .queue-warning-info {
        border-left-color: #4e9eff;
      }
      .history-time {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
      }
      #queue-history,
      #inspect-history {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .history-row {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 6px;
      }
      .history-row:last-child {
        border-bottom: none;
      }
      .history-row-main {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }
      .history-job {
        font-weight: 600;
      }
      .history-message {
        margin: 4px 0 0;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.75);
      }
      .log-level-badge {
        padding: 2px 6px;
        border-radius: 999px;
        font-size: 10px;
        letter-spacing: 0.08em;
      }
      .log-info {
        background: rgba(78, 158, 255, 0.2);
      }
      .log-warn {
        background: rgba(255, 183, 77, 0.2);
      }
      .log-error {
        background: rgba(255, 110, 110, 0.2);
      }
      .inspect-row {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 6px;
      }
      .inspect-row:last-child {
        border-bottom: none;
      }
      .inspect-row-main,
      .inspect-row-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .inspect-row-meta {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.7);
      }
      .diagnostics-export {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      #log-password {
        flex: 1;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(6, 8, 14, 0.6);
        color: inherit;
        padding: 6px 12px;
      }
      #toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        min-width: 200px;
        max-width: 360px;
        background: rgba(44, 132, 255, 0.95);
        color: #fff;
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 13px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        display: none;
      }
      #toast.error {
        background: rgba(255, 82, 82, 0.95);
      }
      #toast.visible {
        display: block;
      }
      .help-card table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .help-card td {
        padding: 4px 0;
        color: rgba(255, 255, 255, 0.75);
      }
      #autosave-indicator {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
      }
      #json-panel {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding: 16px 24px;
        background: #0f1117;
        display: grid;
        grid-template-columns: 1fr 300px;
        gap: 16px;
      }
      #project-json {
        width: 100%;
        min-height: 160px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(5, 7, 12, 0.9);
        color: #e8ecff;
        padding: 12px;
        font-family: 'JetBrains Mono', 'SFMono-Regular', monospace;
      }
      .readonly-banner {
        display: none;
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(255, 183, 77, 0.15);
        color: #ffdca8;
        font-size: 13px;
      }
      .readonly .readonly-banner {
        display: block;
      }
      .readonly #canvas,
      .readonly button[data-align],
      .readonly .toolbar button {
        pointer-events: none;
        opacity: 0.5;
      }
      .banner {
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(78, 158, 255, 0.18);
        font-size: 13px;
      }
      @media (max-width: 1100px) {
        main {
          grid-template-columns: 1fr;
        }
        .sidebar {
          border-right: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        #json-panel {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <ul id="status-list"></ul>
      <div class="toolbar">
        <div class="toolbar-group">
          <button type="button" data-align="left" data-i18n-key="toolbar.alignLeft">Align left</button>
          <button type="button" data-align="top" data-i18n-key="toolbar.alignTop">Align top</button>
          <button type="button" data-align="center" data-i18n-key="toolbar.alignCenter">Align center</button>
        </div>
        <div class="toolbar-group">
          <button type="button" id="btn-undo" data-i18n-key="toolbar.undo">Undo</button>
          <button type="button" id="btn-redo" data-i18n-key="toolbar.redo">Redo</button>
        </div>
        <div class="toolbar-group">
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
            <input type="checkbox" id="running-toggle" /> <span data-i18n-key="toolbar.runningMode">Running mode</span>
          </label>
        </div>
        <div class="toolbar-group locale-group">
          <label for="locale-select" data-i18n-key="toolbar.localeLabel">Language</label>
          <select id="locale-select" data-i18n-attr-aria-label="toolbar.localeLabel">
            <option value="en-US" data-i18n-key="toolbar.locale.en">English</option>
            <option value="ja-JP" data-i18n-key="toolbar.locale.ja">Japanese</option>
          </select>
        </div>
        <span id="autosave-indicator" aria-live="polite" data-i18n-key="autosave.pending">Waiting for changes…</span>
      </div>
    </header>
    <main>
      <section class="sidebar" aria-label="Node search and help" data-i18n-attr-aria-label="sidebar.ariaLabel">
        <div>
          <label class="search-box">
            <span style="font-size:12px; color: rgba(255,255,255,0.7);" data-i18n-key="sidebar.searchLabel">Node search</span>
            <input
              id="node-search"
              type="search"
              placeholder="Load, Trim, Resize..."
              autocomplete="off"
              data-i18n-attr-placeholder="sidebar.searchPlaceholder"
            />
          </label>
          <ul
            id="search-suggestions"
            class="suggestions"
            role="listbox"
            aria-label="Node suggestions"
            data-i18n-attr-aria-label="sidebar.suggestionsLabel"
          ></ul>
        </div>
        <div class="help-card" aria-live="polite">
          <strong data-i18n-key="help.shortcutsTitle">Shortcuts</strong>
          <table>
            <tr><td>Ctrl/Cmd + C</td><td data-i18n-key="help.copy">Copy node</td></tr>
            <tr><td>Ctrl/Cmd + V</td><td data-i18n-key="help.paste">Paste (4px snap)</td></tr>
            <tr><td>Ctrl/Cmd + D</td><td data-i18n-key="help.duplicate">Duplicate</td></tr>
            <tr><td>1</td><td data-i18n-key="help.zoomReset">Zoom 100%</td></tr>
            <tr><td>Shift + 1</td><td data-i18n-key="help.fitSelection">Fit selection</td></tr>
          </table>
        </div>
        <div class="help-card">
          <strong data-i18n-key="help.guideTitle">Guided actions</strong>
          <p data-i18n-html="help.guideHtml">• Drag nodes to move (4px snap)<br />• Press Enter to add highlighted suggestions<br />• Use Tab to focus cards.</p>
        </div>
        <div class="readonly-banner" id="readonly-banner" data-i18n-key="readonly.banner">Read-only because the schema version differs. Editing is disabled.</div>
        <div class="queue-card" aria-label="Job queue" data-i18n-attr-aria-label="queue.ariaLabel">
          <header>
            <strong data-i18n-key="queue.title">Job queue</strong>
            <div class="toolbar-group">
              <button type="button" id="btn-demo-job" data-i18n-key="queue.demoJob">Add demo job</button>
              <button type="button" id="btn-cancel-all" data-i18n-key="queue.cancelAll">Cancel all</button>
            </div>
          </header>
          <div id="queue-warnings" class="queue-alerts" aria-live="polite"></div>
          <div class="queue-lists">
            <div class="queue-section">
              <strong data-i18n-key="queue.status.running">Running</strong>
              <div id="queue-running"></div>
            </div>
            <div class="queue-section">
              <strong data-i18n-key="queue.status.queued">Queued</strong>
              <div id="queue-queued"></div>
            </div>
            <div class="queue-section">
              <strong data-i18n-key="queue.historyTitle">History (20 entries)</strong>
              <div id="queue-history"></div>
            </div>
          </div>
        </div>
        <div class="connections-card" aria-label="Connection list" data-i18n-attr-aria-label="connections.ariaLabel">
          <header>
            <strong data-i18n-key="connections.title">Connections</strong>
            <span id="connection-pending" class="pending-hint" aria-live="polite"></span>
          </header>
          <ul id="connection-list" class="connections-list" role="list"></ul>
        </div>
        <div class="diagnostics-card" aria-label="Logs and diagnostics" data-i18n-attr-aria-label="diagnostics.ariaLabel">
          <header>
            <strong data-i18n-key="diagnostics.title">Logs & diagnostics</strong>
            <label style="display:flex;gap:6px;align-items:center;">
              <input type="checkbox" id="crash-consent" /> <span data-i18n-key="diagnostics.crashConsent">Include crash dumps</span>
            </label>
          </header>
          <div class="diagnostics-export">
            <input
              type="password"
              id="log-password"
              placeholder="Export password"
              autocomplete="off"
              data-i18n-attr-placeholder="diagnostics.passwordPlaceholder"
            />
            <button type="button" id="btn-export-logs" data-i18n-key="diagnostics.exportButton">Export logs</button>
          </div>
          <div id="export-status"></div>
          <div class="queue-section">
            <strong data-i18n-key="diagnostics.inspectHistoryTitle">Inspect history (20 entries)</strong>
            <div id="inspect-history"></div>
          </div>
        </div>
        <div
          class="about-card"
          id="about-card"
          role="region"
          aria-live="polite"
          aria-label="About & licensing"
          data-i18n-attr-aria-label="about.ariaLabel"
        >
          <header>
            <strong data-i18n-key="about.title">About & licensing</strong>
          </header>
          <dl>
            <div>
              <dt data-i18n-key="about.distributionLabel">FFmpeg distribution</dt>
              <dd id="about-distribution"></dd>
            </div>
            <div>
              <dt data-i18n-key="about.licenseLabel">License</dt>
              <dd id="about-license"></dd>
            </div>
            <div>
              <dt data-i18n-key="about.pathLabel">FFmpeg path</dt>
              <dd id="about-path" class="mono"></dd>
            </div>
            <div>
              <dt data-i18n-key="about.versionLabel">FFmpeg version</dt>
              <dd id="about-version"></dd>
            </div>
          </dl>
          <p id="about-notice"></p>
          <div class="about-links">
            <a
              id="about-license-link"
              href="https://ffmpeg.org/legal.html"
              target="_blank"
              rel="noreferrer"
              data-i18n-key="about.licenseLinkLabel"
            >
              License text
            </a>
            <a
              id="about-source-link"
              href="https://ffmpeg.org/download.html#sources"
              target="_blank"
              rel="noreferrer"
              data-i18n-key="about.sourceLinkLabel"
            >
              FFmpeg source
            </a>
          </div>
        </div>
      </section>
      <section class="canvas-wrap">
        <div id="canvas" role="region" aria-label="Node canvas" data-i18n-attr-aria-label="canvas.ariaLabel">
          <svg id="connection-layer" aria-hidden="true"></svg>
          <div id="node-layer"></div>
        </div>
      </section>
    </main>
    <section id="json-panel">
      <div>
        <div class="banner" style="margin-bottom:10px;" data-i18n-key="json.banner">Manage JSON saves and loads here. schemaVersion=1.0.7 is preserved.</div>
        <textarea
          id="project-json"
          spellcheck="false"
          aria-label="JSON for save/load"
          data-i18n-attr-aria-label="json.editorLabel"
        ></textarea>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button type="button" id="btn-export" data-i18n-key="json.export">Export JSON</button>
        <button type="button" id="btn-load" data-i18n-key="json.import">Import JSON</button>
      </div>
    </section>
    <div id="toast" role="status" aria-live="assertive"></div>
${scriptTags}
  </body>
</html>`;
};

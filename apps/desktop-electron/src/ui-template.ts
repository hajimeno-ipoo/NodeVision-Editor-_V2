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

const collectAssetCandidates = (relativePath: string[], maxDepth = 6): string[] => {
  // Walk up the directory tree (src -> app -> repo root) so dev/prod builds can both find shared doc assets.
  const seen = new Set<string>();
  let currentDir: string | null = __dirname;
  for (let depth = 0; depth <= maxDepth && currentDir; depth += 1) {
    seen.add(path.resolve(currentDir, ...relativePath));
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  seen.add(path.resolve(process.cwd(), ...relativePath));
  return Array.from(seen);
};

const loadAssetDataUri = (relativePath: string[], mimeType: string): string | null => {
  const resolvedPath = resolveFirstExistingPath(collectAssetCandidates(relativePath));
  if (!resolvedPath) {
    return null;
  }
  try {
    const base64 = fs.readFileSync(resolvedPath).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.warn('[NodeVision] Failed to read asset:', resolvedPath, error);
    return null;
  }
};

const iconSymbolFromAsset = (dataUri: string | null, defaultSvg: string): string =>
  dataUri
    ? `<img src="${dataUri}" alt="" decoding="async" draggable="false" loading="lazy" />`
    : defaultSvg;

const NODE_SEARCH_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', 'ノード検索.png'], 'image/png');
const DEFAULT_SEARCH_ICON_SYMBOL = `<svg viewBox="0 0 24 24" role="presentation">
                <circle cx="11" cy="11" r="6" />
                <line x1="16" y1="16" x2="21" y2="21" />
              </svg>`;
const NODE_SEARCH_ICON_SYMBOL = iconSymbolFromAsset(NODE_SEARCH_ICON_DATA_URI, DEFAULT_SEARCH_ICON_SYMBOL);

const WORKFLOW_PANEL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', 'ワークフロー.png'], 'image/png');
const DEFAULT_WORKFLOW_ICON_SYMBOL = `<svg viewBox="0 0 24 24" role="presentation">
                <circle cx="8" cy="7" r="2.4" />
                <circle cx="16" cy="7" r="2.4" />
                <circle cx="8" cy="17" r="2.4" />
                <circle cx="16" cy="17" r="2.4" />
                <path d="M10.4 7h3.2" />
                <path d="M8 9.4v5.2" />
                <path d="M16 9.4v5.2" />
                <path d="M10.4 17h3.2" />
              </svg>`;
const WORKFLOW_PANEL_ICON_SYMBOL = iconSymbolFromAsset(WORKFLOW_PANEL_ICON_DATA_URI, DEFAULT_WORKFLOW_ICON_SYMBOL);

const CONNECTION_PANEL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '接続.png'], 'image/png');
const DEFAULT_CONNECTION_ICON_SYMBOL = `<svg viewBox="0 0 24 24" role="presentation">
                <path d="M7 12h4" />
                <path d="M17 12h-4" />
                <path d="M11 9V6.5a2.5 2.5 0 0 1 5 0V9" />
                <path d="M13 15v2.5a2.5 2.5 0 0 1-5 0V15" />
              </svg>`;
const CONNECTION_PANEL_ICON_SYMBOL = iconSymbolFromAsset(
  CONNECTION_PANEL_ICON_DATA_URI,
  DEFAULT_CONNECTION_ICON_SYMBOL
);

const HELP_PANEL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', 'キーボード.png'], 'image/png');
const DEFAULT_HELP_ICON_SYMBOL = `<svg viewBox="0 0 24 24" role="presentation">
                <circle cx="12" cy="12" r="9" />
                <path d="M9 10a3 3 0 0 1 5.7-1.2c.5 1.08.2 2.1-.7 2.8-.8.6-1.5 1.1-1.5 2.4" />
                <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
              </svg>`;
const HELP_PANEL_ICON_SYMBOL = iconSymbolFromAsset(HELP_PANEL_ICON_DATA_URI, DEFAULT_HELP_ICON_SYMBOL);

const ABOUT_PANEL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', 'インフォメーション.png'], 'image/png');
const DEFAULT_ABOUT_ICON_SYMBOL = `<svg viewBox="0 0 24 24" role="presentation">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
                <line x1="12" y1="11" x2="12" y2="17" />
              </svg>`;
const ABOUT_PANEL_ICON_SYMBOL = iconSymbolFromAsset(ABOUT_PANEL_ICON_DATA_URI, DEFAULT_ABOUT_ICON_SYMBOL);

const SELECT_TOOL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '選択.png'], 'image/png');
const SELECT_TOOL_ICON_SYMBOL = iconSymbolFromAsset(SELECT_TOOL_ICON_DATA_URI, '🖱️');

const PAN_TOOL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', 'パン表示.png'], 'image/png');
const PAN_TOOL_ICON_SYMBOL = iconSymbolFromAsset(PAN_TOOL_ICON_DATA_URI, '✋');

const FIT_TOOL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '中央.png'], 'image/png');
const FIT_TOOL_ICON_SYMBOL = iconSymbolFromAsset(FIT_TOOL_ICON_DATA_URI, '🎯');

const ZOOM_OUT_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '縮小.png'], 'image/png');
const ZOOM_OUT_ICON_SYMBOL = iconSymbolFromAsset(ZOOM_OUT_ICON_DATA_URI, '－');

const ZOOM_IN_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '拡大.png'], 'image/png');
const ZOOM_IN_ICON_SYMBOL = iconSymbolFromAsset(ZOOM_IN_ICON_DATA_URI, '＋');

const FLIP_HORIZONTAL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '左右反転.svg'], 'image/svg+xml');
const FLIP_HORIZONTAL_ICON_SYMBOL = iconSymbolFromAsset(FLIP_HORIZONTAL_ICON_DATA_URI, '⇄');

const FLIP_VERTICAL_ICON_DATA_URI = loadAssetDataUri(['doc', 'icon', '上下反転.svg'], 'image/svg+xml');
const FLIP_VERTICAL_ICON_SYMBOL = iconSymbolFromAsset(FLIP_VERTICAL_ICON_DATA_URI, '⇅');

const ICONS_EMBED = JSON.stringify({
  zoomOut: ZOOM_OUT_ICON_SYMBOL,
  zoomIn: ZOOM_IN_ICON_SYMBOL,
  flipHorizontal: FLIP_HORIZONTAL_ICON_SYMBOL,
  flipVertical: FLIP_VERTICAL_ICON_SYMBOL
});

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

  const normalizeModuleId = (relativeDir: string, fileBase: string): string => {
    const segments = relativeDir ? relativeDir.split(path.sep) : [];
    segments.push(fileBase);
    return `./${segments.join('/')}`;
  };

  const collectModules = (relativeDir = ''): Array<{ id: string; code: string }> => {
    const absoluteDir = relativeDir ? path.join(moduleDir, relativeDir) : moduleDir;
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    const modules: Array<{ id: string; code: string }> = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        modules.push(...collectModules(path.join(relativeDir, entry.name)));
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.endsWith(extension) || entry.name.endsWith('.d.ts')) {
        continue;
      }
      const fileBase = entry.name.slice(0, -extension.length);
      const moduleId = normalizeModuleId(relativeDir, fileBase);
      const absolutePath = path.join(absoluteDir, entry.name);
      let code = fs.readFileSync(absolutePath, 'utf8');
      if (extension === '.ts' && ts) {
        code = ts.transpileModule(code, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020
          }
        }).outputText;
      }
      const cleaned = stripSourceMapComment(code);
      modules.push({ id: moduleId, code: cleaned });
    }
    return modules;
  };

  const moduleEntries = collectModules()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, code }) => `  '${id}': function (exports, require, module) {\n${code}\n  }`)
    .join(',\n');

  const runtime = `(function(){
  const modules = {
${moduleEntries}
  };
  const cache = {};
  const splitPath = value => {
    let input = value;
    if (input.startsWith('./')) {
      input = input.slice(2);
    }
    return input.split('/').filter(Boolean);
  };
  const normalize = (from, request) => {
    const base = splitPath(from);
    if (base.length) {
      base.pop();
    }
    const segments = splitPath(request);
    for (const segment of segments) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        base.pop();
      } else {
        base.push(segment);
      }
    }
    return './' + base.join('/');
  };
  const resolveId = id => {
    if (modules[id]) {
      return id;
    }
    const indexId = id.endsWith('/index') ? null : id + '/index';
    if (indexId && modules[indexId]) {
      return indexId;
    }
    return null;
  };
  const require = (request, from = './') => {
    const target = request.startsWith('.') ? normalize(from, request) : request;
    const id = resolveId(target);
    if (!id) {
      throw new Error('Renderer module not found: ' + target);
    }
    if (cache[id]) {
      return cache[id].exports;
    }
    const module = { exports: {} };
    cache[id] = module;
    const localRequire = child => require(child, id);
    modules[id](module.exports, localRequire, module);
    return module.exports;
  };
  require('./app', './app');
})();`;
  return stripSourceMapComment(runtime);
};

const loadRendererBundle = (): string => {
  if (rendererScriptCache) {
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

  const jsPath = resolveFirstExistingPath([
    path.resolve(__dirname, 'renderer', 'app.js'),
    path.resolve(__dirname, '..', 'dist', 'renderer', 'app.js')
  ]);
  if (jsPath) {
    rendererScriptCache = buildInlineBundle(path.dirname(jsPath), '.js');
    return rendererScriptCache;
  }

  throw new Error(
    'Renderer bundle not found. Run `pnpm --filter desktop-electron build` to emit apps/desktop-electron/dist/renderer/app.js.'
  );
};

// Helper to load package assets
const loadPackageAsset = (pkg: string, pathInPkg: string): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkgPath = require.resolve(`${pkg}/package.json`);
    const assetPath = path.join(path.dirname(pkgPath), pathInPkg);
    return fs.readFileSync(assetPath, 'utf-8');
  } catch (e) {
    console.warn(`[NodeVision] Failed to load asset ${pkg}/${pathInPkg}`, e);
    return '';
  }
};

const CROPPER_CSS = loadPackageAsset('cropperjs', 'dist/cropper.css');
const CROPPER_JS = loadPackageAsset('cropperjs', 'dist/cropper.js');

const buildRendererScripts = (encodedPayload: string): string => {
  const bootstrapScript = [
    '    <script>',
    `      window.__NODEVISION_BOOTSTRAP__ = JSON.parse(decodeURIComponent('${encodedPayload}'));`,
    `      window.__NODEVISION_TRANSLATIONS__ = ${TRANSLATIONS_EMBED};`,
    `      window.__NODEVISION_ICONS__ = ${ICONS_EMBED};`,
    `      window.__NODEVISION_SUPPORTED_LOCALES__ = ${SUPPORTED_LOCALES_EMBED};`,
    `      window.__NODEVISION_FALLBACK_LOCALE__ = '${DEFAULT_LOCALE}';`,
    '    </script>'
  ].join('\n');

  const rendererTag = ['    <script>', indentRendererScript(loadRendererBundle()), '    </script>'].join('\n');
  const cropperScript = ['    <script>', CROPPER_JS, '    </script>'].join('\n');

  return `${bootstrapScript}\n${cropperScript}\n${rendererTag}`;
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
      ${CROPPER_CSS}
      .cropper-rotate-handle {
        position: absolute;
        bottom: -40px;
        left: 50%;
        transform: translateX(-50%);
        width: 24px;
        height: 24px;
        background-color: #4d73ff;
        border-radius: 50%;
        cursor: grab;
        z-index: 2020;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }
      .cropper-rotate-handle::before {
        content: '';
        position: absolute;
        top: -16px;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 16px;
        background-color: #4d73ff;
      }
      .cropper-rotate-handle::after {
        content: '↻';
        color: white;
        font-size: 16px;
        font-weight: bold;
        line-height: 1;
      }
      .cropper-rotate-handle:active {
        cursor: grabbing;
      }
      /* Portrait mode: move handle to right side */
      .trim-image-stage.is-portrait .cropper-rotate-handle {
        bottom: auto;
        top: 50%;
        left: auto;
        right: -40px;
        transform: translate(0, -50%);
      }
      .trim-image-stage.is-portrait .cropper-rotate-handle::before {
        top: 50%;
        left: -16px;
        bottom: auto;
        transform: translate(0, -50%);
        width: 16px;
        height: 2px;
      }
      .trim-rotate-control {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 120px;
        margin: 0 8px;
      }
      .trim-rotate-slider {
        flex: 1;
        cursor: pointer;
        accent-color: #4d73ff;
        height: 4px;
        min-width: 0;
      }
      .trim-rotate-value {
        font-variant-numeric: tabular-nums;
        min-width: 3.5em;
        text-align: right;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
        user-select: none;
      }
      .trim-rotate-icon {
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        color: rgba(255, 255, 255, 0.6);
        transition: color 0.2s;
        user-select: none;
        padding: 4px;
        margin: -4px;
        border-radius: 4px;
      }
      .trim-rotate-icon:hover {
        color: #4d73ff;
        background: rgba(255, 255, 255, 0.1);
      }
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
        --sidebar-collapsed-width: 72px;
        --sidebar-expanded-width: 392px;
        --sidebar-width: var(--sidebar-collapsed-width);
        --panel-width: calc(var(--sidebar-expanded-width) - var(--sidebar-collapsed-width));
        flex: 1;
        display: grid;
        grid-template-columns: var(--sidebar-width) 1fr;
        min-height: 0;
        transition: grid-template-columns 220ms ease;
      }
      main.sidebar-open {
        --sidebar-width: var(--sidebar-expanded-width);
      }
      .sidebar {
        border-right: 1px solid rgba(255, 255, 255, 0.04);
        background: linear-gradient(180deg, #141518, #101113);
        display: flex;
        min-height: 0;
        width: var(--sidebar-width);
        min-width: var(--sidebar-width);
        transition: width 220ms ease;
      }
      .sidebar-icons {
        width: 72px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: center;
        padding: 12px 0;
      }
      .sidebar-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.25);
        color: rgba(255, 255, 255, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: border 150ms ease, background 150ms ease, transform 150ms ease;
      }
      .sidebar-icon-symbol {
        width: 44px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .sidebar-icon-symbol svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .sidebar-icon-symbol img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .sidebar-icon:not([data-panel="panel-queue"]):not([data-panel="panel-diagnostics"]) .sidebar-icon-symbol {
        filter: invert(1);
      }
      .sidebar-icon:focus-visible {
        outline: 2px solid #7dc3ff;
        outline-offset: 3px;
      }
      .sidebar-icon.active {
        border-color: rgba(255, 223, 107, 0.9);
        background: rgba(255, 223, 107, 0.18);
        color: #ffe089;
        transform: translateX(4px);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: visible;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }
      .sidebar-panel-container {
        flex: 0 0 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 16px;
        opacity: 0;
        pointer-events: none;
        padding: 0;
        background: linear-gradient(180deg, #1a1b21, #111218);
        border-left: 1px solid rgba(255, 255, 255, 0.06);
        box-shadow: none;
        transition:
          flex-basis 220ms ease,
          opacity 200ms ease,
          padding 200ms ease,
          box-shadow 200ms ease;
      }
      main.sidebar-open .sidebar-panel-container {
        flex: 0 0 var(--panel-width);
        padding: 20px 24px 24px;
        opacity: 1;
        pointer-events: auto;
        box-shadow: 12px 0 24px rgba(0, 0, 0, 0.35);
      }
      .sidebar-panel {
        display: none;
        flex-direction: column;
        gap: 16px;
        min-height: 0;
      }
      .sidebar-panel.active {
        display: flex;
      }
      .canvas-wrap {
        position: relative;
        overflow: hidden;
        background-color: #14151b;
        --grid-minor-size: 8px;
        --grid-major-size: 32px;
        --grid-offset-x: 0px;
        --grid-offset-y: 0px;
      }
      #canvas-grid {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-color: #16171c;
        background-image:
          linear-gradient(var(--grid-minor-angle-x, 90deg), rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(var(--grid-minor-angle-y, 0deg), rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(var(--grid-major-angle-x, 90deg), rgba(255, 255, 255, 0.045) 1px, transparent 1px),
          linear-gradient(var(--grid-major-angle-y, 0deg), rgba(255, 255, 255, 0.045) 1px, transparent 1px);
        background-size:
          var(--grid-minor-size) var(--grid-minor-size),
          var(--grid-minor-size) var(--grid-minor-size),
          var(--grid-major-size) var(--grid-major-size),
          var(--grid-major-size) var(--grid-major-size);
        background-position:
          var(--grid-offset-x) var(--grid-offset-y),
          var(--grid-offset-x) var(--grid-offset-y),
          var(--grid-offset-x) var(--grid-offset-y),
          var(--grid-offset-x) var(--grid-offset-y);
        z-index: 0;
      }
      #canvas {
        position: absolute;
        inset: 0;
        cursor: default;
        transform-origin: 0 0;
        z-index: 1;
      }
      body[data-canvas-tool='pan'] #canvas {
        cursor: grab;
      }
      body[data-canvas-tool='pan'].is-panning #canvas {
        cursor: grabbing;
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
      #selection-rect {
        position: absolute;
        border: 1px solid rgba(77, 115, 255, 0.9);
        background: rgba(77, 115, 255, 0.25);
        border-radius: 10px;
        pointer-events: none;
        display: none;
        z-index: 2;
      }
      #selection-outline {
        position: absolute;
        border: 2px dashed rgba(255, 255, 255, 0.5);
        border-radius: 18px;
        pointer-events: auto;
        display: none;
        z-index: 1;
        cursor: move;
      }
      .canvas-controls {
        position: fixed;
        left: 24px;
        bottom: 24px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(7, 9, 15, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 6px 12px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(14px);
        z-index: 10;
        cursor: grab;
        touch-action: none;
      }
      .canvas-controls.is-dragging {
        cursor: grabbing;
      }
      .canvas-tool {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(7, 9, 15, 0.85);
        color: #f5f7ff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        cursor: pointer;
        transition: background 180ms ease, color 180ms ease, border 180ms ease, transform 180ms ease;
      }
      .canvas-tool:hover,
      .canvas-tool:focus-visible {
        background: rgba(255, 223, 107, 0.18);
        border-color: rgba(255, 223, 107, 0.35);
        color: #ffe089;
      }
      .canvas-tool:focus-visible {
        outline: 2px solid #6ea8ff;
        outline-offset: 2px;
      }
      .canvas-tool:active {
        background: rgba(255, 223, 107, 0.28);
        border-color: rgba(255, 223, 107, 0.55);
        color: #fff2c1;
      }
      .canvas-tool.active {
        background: rgba(255, 223, 107, 0.28);
        border-color: rgba(255, 223, 107, 0.55);
        color: #fff2c1;
        box-shadow: 0 6px 20px rgba(15, 16, 24, 0.4);
      }
      .canvas-tool-icon {
        width: 46px;
        height: 46px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      }
      .canvas-tool-icon img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
        filter: invert(1);
      }
      .canvas-controls-divider {
        width: 1px;
        height: 32px;
        background: rgba(255, 255, 255, 0.08);
      }
      .zoom-control {
        position: relative;
      }
      #zoom-display {
        min-width: 76px;
        height: 36px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(23, 24, 32, 0.75);
        color: #f5f7ff;
        padding: 0 16px;
        font-size: 15px;
        transition: border 150ms ease, background 150ms ease, color 150ms ease;
        outline: none;
      }
      #zoom-display[aria-expanded='true'],
      #zoom-display:hover,
      #zoom-display:focus-visible {
        background: rgba(255, 223, 107, 0.18);
        border-color: rgba(255, 223, 107, 0.35);
        color: #ffe089;
      }
      #zoom-display:active {
        background: rgba(255, 223, 107, 0.28);
        border-color: rgba(255, 223, 107, 0.55);
        color: #fff2c1;
      }
      #zoom-menu {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        width: 260px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(8, 11, 19, 0.98);
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.55);
        padding: 12px;
        display: none;
        flex-direction: column;
        gap: 6px;
      }
      #zoom-menu[data-open='true'] {
        display: flex;
      }
      #zoom-menu button {
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(19, 22, 33, 0.95);
        color: #f5f7ff;
        transition: background 160ms ease, border 160ms ease, color 160ms ease;
        outline: none;
        width: 100%;
        padding: 9px 12px;
        font-size: 15px;
        text-align: left;
        white-space: nowrap;
      }
      #zoom-menu button:hover,
      #zoom-menu button:focus-visible {
        background: rgba(255, 223, 107, 0.18);
        border-color: rgba(255, 223, 107, 0.35);
        color: #ffe089;
      }
      #zoom-menu button:active {
        background: rgba(255, 223, 107, 0.28);
        border-color: rgba(255, 223, 107, 0.55);
        color: #fff2c1;
      }
      #zoom-menu hr {
        border: none;
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
        margin: 6px 0;
      }
      .zoom-input-row {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      #zoom-input {
        flex: 1;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(13, 15, 23, 0.95);
        color: #f5f7ff;
        padding: 8px 12px;
        font-size: 15px;
      }
      #zoom-input:focus-visible {
        outline: 2px solid #6ea8ff;
        outline-offset: 2px;
      }
      #zoom-apply {
        border-radius: 10px;
        border: none;
        padding: 8px 14px;
        font-size: 15px;
        background: #4d73ff;
        color: #fff;
        box-shadow: 0 6px 14px rgba(77, 115, 255, 0.4);
      }
      .node {
        position: absolute;
        border-radius: 18px;
        padding: 0 0 14px;
        min-width: 336px;
        min-height: 460px;
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
      body.node-dragging .node {
        transition: border 160ms ease, box-shadow 160ms ease;
      }
      .node::after {
        content: '';
        position: absolute;
        inset: 4px;
        border-radius: 14px;
        border: 2px solid transparent;
        pointer-events: none;
        opacity: 0;
        transition: border-color 150ms ease, opacity 150ms ease, box-shadow 150ms ease;
      }
      .node-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px 18px 6px;
        background: linear-gradient(180deg, #fefefe, #ececef);
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        position: relative;
      }
      .node-header-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      button.node-delete-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: none;
        padding: 0;
        background: #ff5662;
        color: transparent;
        font-size: 0;
        line-height: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: none;
        transition: none;
        appearance: none;
        -webkit-appearance: none;
      }
      button.node-delete-btn:focus-visible {
        outline: 1px solid rgba(255, 255, 255, 0.8);
        outline-offset: 2px;
      }
      button.node-delete-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
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
      .node-resize-handle {
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(33, 119, 255, 0.95);
        border: 2px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 6px 12px rgba(33, 119, 255, 0.4);
        cursor: pointer;
        z-index: 2;
      }
      .node-resize-nw {
        top: -8px;
        left: -8px;
        cursor: nwse-resize;
      }
      .node-resize-ne {
        top: -8px;
        right: -8px;
        cursor: nesw-resize;
      }
      .node-resize-sw {
        bottom: -8px;
        left: -8px;
        cursor: nesw-resize;
      }
      .node-resize-se {
        bottom: -8px;
        right: -8px;
        cursor: nwse-resize;
      }
      .node.node-highlight,
      .node.node-pressed {
        border-color: rgba(255, 223, 107, 0.8);
        box-shadow: 0 0 0 3px rgba(255, 223, 107, 0.35), 0 18px 32px rgba(0, 0, 0, 0.4);
      }
      .node.node-highlight::after,
      .node.node-pressed::after {
        border-color: rgba(255, 223, 107, 0.95);
        opacity: 1;
        box-shadow: 0 0 18px rgba(255, 223, 107, 0.6);
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
        justify-content: space-between;
        align-items: flex-start;
        padding: 8px 18px 0;
        gap: 12px;
      }
      .node-info {
        margin: 6px 18px 10px;
        padding: 10px 12px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.7);
        color: #1f1f24;
        font-size: 12px;
        line-height: 1.4;
      }
      .node-info-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .node-info-chip {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        background: rgba(0, 0, 0, 0.08);
        padding: 2px 8px;
        border-radius: 999px;
      }
      .node-info-desc {
        margin: 4px 0 8px;
        color: rgba(31, 31, 36, 0.75);
      }
      .node-info-tip {
        margin: 8px 0 0;
        font-size: 11px;
        color: rgba(31, 31, 36, 0.8);
      }
      .node-status-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .node-status {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        border-radius: 8px;
        border: 1px solid rgba(0, 0, 0, 0.06);
        padding: 6px 8px;
        font-size: 11px;
      }
      .node-status-ok {
        background: rgba(52, 199, 89, 0.18);
        color: #116229;
      }
      .node-status-warn {
        background: rgba(255, 149, 0, 0.18);
        color: #7d3a00;
      }
      #status-list {
        display: none;
      }
      .node-ports .ports {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .node-ports .ports.input {
        align-items: flex-start;
      }
      .node-ports .ports.output {
        align-items: flex-end;
      }
      /* Load node styles */
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media {
        padding: 0 18px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        padding-top: 12px;
        flex: 1 1 auto;
        min-height: 0;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia) .node-media-upload {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 18px;
        border-radius: 12px;
        border: 1px solid rgba(0, 0, 0, 0.18);
        background: linear-gradient(180deg, #dcdfe8, #bec4d8);
        color: #1d2333;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        overflow: hidden;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia) .node-media-upload.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia) .node-media-upload span {
        pointer-events: none;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia) .node-media-upload input[type="file"] {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia) .node-media-upload input[type="file"]:disabled {
        cursor: not-allowed;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-empty {
        margin: 0;
        font-size: 12px;
        color: rgba(48, 48, 60, 0.6);
        text-align: center;
        padding: 6px 0 2px;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-frame {
        width: 100%;
        display: flex;
        justify-content: center;
        flex: 1 1 auto;
        min-height: 0;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-preview {
        border: none;
        border-radius: 0;
        overflow: hidden;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        width: min(100%, var(--preview-width, 320px));
        height: min(var(--preview-height, 240px), 100%);
        max-width: 100%;
        max-height: 100%;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-preview img,
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-preview video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: transparent;
        border-radius: 0;
        box-shadow: none;
        max-width: 100%;
        max-height: 100%;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-toolbar {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia) .node-media-arrow {
        border-radius: 999px;
        width: 32px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 600;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-filename {
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 999px;
        padding: 4px 12px;
        background: rgba(255, 255, 255, 0.65);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .node:is(.node-type-loadimage, .node-type-loadvideo, .node-type-loadmedia, .node-type-mediapreview) .node-media-aspect {
        margin: 10px 0 0;
        font-size: 13px;
        text-align: center;
        color: rgba(48, 48, 60, 0.85);
        font-weight: 600;
      }
      .node-media-hints {
        margin: 6px 0 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .node-media-hint {
        margin: 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
      }
      .node-media-hint.accent {
        font-weight: 600;
        color: rgba(255, 224, 137, 0.9);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .trim-launcher {
        margin-top: 16px;
        padding: 16px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.12));
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .trim-launcher-buttons {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .trim-launcher-btn {
        flex: 1 1 120px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-weight: 600;
        padding: 10px 16px;
        cursor: pointer;
        transition: background 150ms ease, border-color 150ms ease;
      }
      .trim-launcher-btn:hover,
      .trim-launcher-btn:focus-visible {
        border-color: rgba(255, 224, 137, 0.9);
        background: rgba(255, 224, 137, 0.15);
        outline: none;
      }
      .trim-launcher-status {
        margin: 0;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.85);
      }
      .nv-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(6, 6, 10, 0.75);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 24px;
      }
      .nv-modal-backdrop[data-open='true'] {
        display: flex;
      }
      .nv-modal {
        width: min(880px, calc(100vw - 40px));
        max-height: 92vh;
        overflow: hidden;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #11121a;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 28px 36px 40px;
      }
      .nv-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .nv-modal-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
      }
      .nv-modal-close {
        border: none;
        background: rgba(255, 255, 255, 0.1);
        color: inherit;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        font-size: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        cursor: pointer;
      }
      .nv-modal-close:hover,
      .nv-modal-close:focus-visible {
        background: rgba(255, 224, 137, 0.3);
        outline: none;
      }
      .nv-modal-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 20px;
        overflow-y: auto;
        max-height: calc(92vh - 80px);
      }
      .trim-modal-placeholder {
        margin: 0;
        padding: 40px 0;
        text-align: center;
        font-size: 15px;
        color: rgba(255, 255, 255, 0.85);
      }
      .trim-image-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .trim-image-toolbar-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .trim-tool-button {
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        color: inherit;
        font-size: 13px;
        padding: 8px 12px;
        cursor: pointer;
        min-height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1.2;
      }
      .trim-tool-button[data-active='true'] {
        background: rgba(255, 224, 137, 0.2);
        border-color: rgba(255, 224, 137, 0.8);
      }
      .trim-tool-button[data-trim-tool='zoom-in'],
      .trim-tool-button[data-trim-tool='zoom-out'],
      .trim-tool-button[data-trim-tool='flip-horizontal'],
      .trim-tool-button[data-trim-tool='flip-vertical'] {
        width: 42px;
        padding: 0;
        font-size: 18px;
      }
      .trim-tool-button[data-trim-tool='zoom-in'] img,
      .trim-tool-button[data-trim-tool='zoom-out'] img,
      .trim-tool-button[data-trim-tool='flip-horizontal'] img,
      .trim-tool-button[data-trim-tool='flip-vertical'] img {
        width: 24px;
        height: 24px;
        object-fit: contain;
        filter: invert(1);
      }
      .trim-stage-wrapper {
        position: relative;
        width: 100%;
        max-width: 96vw;
        padding: 12px 0 28px;
        z-index: 10;
        /* overflow: hidden; removed to allow handle visibility */
      }
      .trim-image-stage {
        position: relative;
        border-radius: 24px;
        /* overflow: hidden; removed to allow handle visibility */
        background: rgba(255, 255, 255, 0.04);
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        flex: 0 0 auto;
        align-self: center;
        width: min(90vw, 880px);
        height: min(55vh, 560px);
        /* padding: 24px; removed to maximize image size */
        box-sizing: border-box;
      }
      .trim-image-stage .cropper-container {
        overflow: visible !important;
      }
      .trim-grid-overlay {
        position: absolute;
        inset: 0;
        border-radius: 24px;
        pointer-events: none;
        background-size: 20px 20px;
        background-image: linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
        opacity: 0;
        transition: opacity 150ms ease;
      }
      .trim-grid-overlay.is-visible {
        opacity: 1;
      }
      .trim-image-stage img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
        user-select: none;
        pointer-events: auto; /* Cropper.js needs pointer events on the <img> */
        touch-action: none;
        max-width: 100%;
        max-height: 100%;
      }
      /* === Cropper.js minimal styles (inlined to ensure modal shows crop box) === */
      .cropper-container {
        direction: ltr;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5;
        font-size: 0;
        line-height: 0;
        touch-action: none;
        user-select: none;
        pointer-events: auto;
      }
      .cropper-container img {
        display: block;
        max-width: none;
        width: 100%;
        height: 100%;
      }
      .cropper-wrap-box,
      .cropper-canvas,
      .cropper-drag-box,
      .cropper-crop-box,
      .cropper-modal {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }
      .cropper-drag-box {
        opacity: 0;
        background: #fff;
        cursor: move;
      }
      .cropper-crop-box {
        border: 1px solid #39f;
        box-sizing: border-box;
      }
      .cropper-view-box {
        box-sizing: border-box;
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
        outline: 1px solid #39f;
        outline-color: rgba(51, 153, 255, 0.75);
      }
      .cropper-face {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.001);
        cursor: move;
      }
      .cropper-line {
        position: absolute;
        display: block;
        opacity: 0.1;
        background-color: #39f;
      }
      .cropper-line.line-n { top: -3px; left: 0; height: 2px; width: 100%; cursor: n-resize; }
      .cropper-line.line-s { bottom: -3px; left: 0; height: 2px; width: 100%; cursor: s-resize; }
      .cropper-line.line-e { top: 0; right: -3px; width: 2px; height: 100%; cursor: e-resize; }
      .cropper-line.line-w { top: 0; left: -3px; width: 2px; height: 100%; cursor: w-resize; }
      .cropper-point {
        position: absolute;
        width: 8px;
        height: 8px;
        opacity: 0.75;
        background-color: #39f;
      }
      .cropper-point.point-n { top: -4px; left: 50%; margin-left: -4px; cursor: n-resize; }
      .cropper-point.point-s { bottom: -4px; left: 50%; margin-left: -4px; cursor: s-resize; }
      .cropper-point.point-e { right: -4px; top: 50%; margin-top: -4px; cursor: e-resize; }
      .cropper-point.point-w { left: -4px; top: 50%; margin-top: -4px; cursor: w-resize; }
      .cropper-point.point-ne { right: -4px; top: -4px; cursor: ne-resize; }
      .cropper-point.point-nw { left: -4px; top: -4px; cursor: nw-resize; }
      .cropper-point.point-se { right: -4px; bottom: -4px; cursor: se-resize; }
      .cropper-point.point-sw { left: -4px; bottom: -4px; cursor: sw-resize; }
      .cropper-modal {
        background-color: rgba(0, 0, 0, 0.5);
      }
      .trim-image-controls {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin: 8px 0 12px;
      }
      .trim-control {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 12px 14px;
      }
      .trim-control label {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
      }
      .trim-control-inputs {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .trim-control-inputs input[type='range'] {
        flex: 1;
      }
      .trim-control-inputs input[type='number'] {
        width: 64px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        padding: 6px 8px;
      }
      .trim-control-badge {
        border-radius: 999px;
        padding: 4px 12px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 12px;
      }
      .trim-control-unit {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
      }
      .trim-control select {
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        color: inherit;
        padding: 8px 10px;
      }
      .trim-crop-box {
        --trim-crop-border-color: rgba(255, 255, 255, 0.92);
        --trim-crop-grid-color: rgba(255, 255, 255, 0.7);
        --trim-crop-handle-bg: rgba(255, 255, 255, 0.95);
        --trim-crop-handle-border: rgba(20, 25, 45, 0.35);
        --trim-crop-shadow-opacity: 0.6;
        --trim-grid-rotation: 0deg;
        position: absolute;
        border: 2px solid var(--trim-crop-border-color);
        box-sizing: border-box;
        border-radius: 20px;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35), 0 0 0 9999px rgba(0, 0, 0, var(--trim-crop-shadow-opacity));
        cursor: move;
        overflow: hidden;
        transition: border-color 200ms ease, box-shadow 200ms ease;
      }
      .trim-crop-box::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1px solid rgba(255, 255, 255, 0.35);
        pointer-events: none;
      }
      .trim-crop-box[data-trim-grid-visible='false'] .trim-crop-grid {
        opacity: 0.2;
      }
      .trim-crop-grid {
        position: absolute;
        inset: 0;
        pointer-events: none;
        transform: rotate(var(--trim-grid-rotation, 0deg));
        transform-origin: center;
        transition: opacity 150ms ease;
      }
      .trim-crop-grid-line {
        position: absolute;
        background: linear-gradient(
          to var(--line-direction, bottom),
          transparent,
          var(--trim-crop-grid-color) 50%,
          transparent
        );
        opacity: 0.9;
      }
      .trim-crop-grid-line--horizontal {
        height: 1px;
        width: 100%;
        left: 0;
        --line-direction: right;
      }
      .trim-crop-grid-line--vertical {
        width: 1px;
        height: 100%;
        top: 0;
        --line-direction: bottom;
      }
      .trim-crop-grid-line[data-trim-grid-line='h1'] {
        top: 33.333%;
      }
      .trim-crop-grid-line[data-trim-grid-line='h2'] {
        top: 66.666%;
      }
      .trim-crop-grid-line[data-trim-grid-line='v1'] {
        left: 33.333%;
      }
      .trim-crop-grid-line[data-trim-grid-line='v2'] {
        left: 66.666%;
      }
      .trim-crop-handle {
        position: absolute;
        background: var(--trim-crop-handle-bg);
        border: 1px solid var(--trim-crop-handle-border);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      }
      .trim-crop-handle::before {
        content: '';
        position: absolute;
        inset: -12px;
      }
      .trim-crop-handle[data-trim-handle='nw'],
      .trim-crop-handle[data-trim-handle='ne'],
      .trim-crop-handle[data-trim-handle='sw'],
      .trim-crop-handle[data-trim-handle='se'] {
        width: 18px;
        height: 18px;
      }
      .trim-crop-handle[data-trim-handle='nw'] {
        top: -9px;
        left: -9px;
        cursor: nwse-resize;
      }
      .trim-crop-handle[data-trim-handle='ne'] {
        top: -9px;
        right: -9px;
        cursor: nesw-resize;
      }
      .trim-crop-handle[data-trim-handle='sw'] {
        bottom: -9px;
        left: -9px;
        cursor: nesw-resize;
      }
      .trim-crop-handle[data-trim-handle='se'] {
        bottom: -9px;
        right: -9px;
        cursor: nwse-resize;
      }
      .trim-crop-handle[data-trim-handle='n'],
      .trim-crop-handle[data-trim-handle='s'] {
        width: 48px;
        height: 10px;
        border-radius: 999px;
      }
      .trim-crop-handle[data-trim-handle='n'] {
        top: -6px;
        left: 50%;
        transform: translateX(-50%);
        cursor: ns-resize;
      }
      .trim-crop-handle[data-trim-handle='s'] {
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        cursor: ns-resize;
      }
      .trim-crop-handle[data-trim-handle='w'],
      .trim-crop-handle[data-trim-handle='e'] {
        width: 10px;
        height: 48px;
        border-radius: 999px;
      }
      .trim-crop-handle[data-trim-handle='w'] {
        left: -6px;
        top: 50%;
        transform: translateY(-50%);
        cursor: ew-resize;
      }
      .trim-crop-handle[data-trim-handle='e'] {
        right: -6px;
        top: 50%;
        transform: translateY(-50%);
        cursor: ew-resize;
      }
      .trim-modal-hint {
        margin: 0;
        padding-bottom: 8px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.75);
        text-align: center;
      }
      .trim-modal-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .trim-modal-actions-spacer {
        flex: 1;
      }
      .trim-video-layout {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 12px;
      }
      @media (min-width: 720px) {
        .trim-video-layout {
          flex-direction: row;
        }
      }
      .trim-video-preview {
        flex: 1;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.03);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .trim-video-preview.is-empty {
        border-style: dashed;
        border-color: rgba(255, 255, 255, 0.2);
      }
      .trim-video-preview video {
        width: 100%;
        border-radius: 16px;
        background: #000;
        display: block;
        min-height: 200px;
      }
      .trim-video-preview-empty {
        min-height: 200px;
        border-radius: 16px;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.75);
      }
      .trim-video-preview-meta {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        gap: 12px;
      }
      .trim-video-preview-name {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .trim-video-fields {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px;
      }
      .trim-video-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.85);
      }
      .trim-video-field input {
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.06);
        padding: 10px 12px;
        color: inherit;
        font-size: 14px;
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
      }
      .trim-video-field input:disabled {
        opacity: 0.5;
      }
      .trim-video-checkbox {
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 12px;
        display: flex;
        gap: 10px;
        align-items: flex-start;
      }
      .trim-video-checkbox input {
        margin-top: 4px;
      }
      .trim-video-checkbox small {
        display: block;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
      }
      .trim-video-timeline {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .trim-video-timeline[data-disabled='true'] {
        opacity: 0.5;
        pointer-events: none;
      }
      .trim-video-track {
        position: relative;
        height: 36px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .trim-video-range {
        position: absolute;
        top: 4px;
        bottom: 4px;
        left: 12px;
        width: calc(100% - 24px);
        border-radius: 999px;
        background: rgba(255, 224, 137, 0.2);
        border: 1px solid rgba(255, 224, 137, 0.9);
      }
      .trim-video-handle {
        position: absolute;
        top: -6px;
        width: 14px;
        height: 48px;
        border-radius: 999px;
        border: none;
        background: #ffe089;
        cursor: ew-resize;
      }
      .trim-video-handle[data-trim-video-handle='start'] {
        left: -7px;
      }
      .trim-video-handle[data-trim-video-handle='end'] {
        right: -7px;
      }
      .trim-video-timecodes {
        display: flex;
        justify-content: space-between;
        font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
      }
      .trim-video-actions {
        flex-wrap: wrap;
      }
      .trim-video-transport {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }
      .pill-button.primary {
        background: #ffe089;
        color: #11121a;
        border: none;
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
      button.node-delete-btn,
      button.node-delete-btn:hover,
      button.node-delete-btn:focus,
      button.node-delete-btn:focus-visible {
        background: #ff5662 !important;
        color: transparent;
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
      .workflow-dropdown {
        position: relative;
      }
      #workflow-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(5, 9, 20, 0.7);
        color: #f5f7ff;
      }
      #workflow-toggle span.chevron {
        font-size: 10px;
        opacity: 0.7;
      }
      #workflow-menu {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        min-width: 220px;
        background: rgba(8, 11, 19, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 14px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
        padding: 8px;
        display: none;
        flex-direction: column;
        gap: 2px;
        z-index: 30;
      }
      #workflow-menu[data-open='true'] {
        display: flex;
      }
      #workflow-menu button {
        width: 100%;
        padding: 8px 10px;
        border-radius: 10px;
        border: none;
        background: transparent;
        color: #f5f7ff;
        display: flex;
        justify-content: flex-start;
        gap: 8px;
        font-size: 13px;
      }
      #workflow-menu button:hover {
        background: rgba(255, 255, 255, 0.08);
      }
      .workflow-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .workflow-panel header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      #workflow-create {
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
      }
      #workflow-search {
        width: 100%;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(12, 15, 23, 0.85);
        color: inherit;
      }
      #workflow-empty {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
      #workflow-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #workflow-list button {
        width: 100%;
        text-align: left;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(16, 19, 28, 0.8);
        padding: 10px 12px;
        color: inherit;
      }
      #workflow-list button.active {
        border-color: rgba(255, 255, 255, 0.35);
        background: rgba(255, 255, 255, 0.12);
      }
      .workflow-item-name {
        font-size: 13px;
        font-weight: 600;
      }
      .workflow-item-meta {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
      }
      #workflow-context-menu {
        position: fixed;
        min-width: 180px;
        background: rgba(5, 8, 15, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 6px;
        display: none;
        flex-direction: column;
        gap: 4px;
        z-index: 90;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      }
      #workflow-context-menu[data-open='true'] {
        display: flex;
      }
      #workflow-context-menu button {
        width: 100%;
        border: none;
        border-radius: 10px;
        padding: 8px 10px;
        background: transparent;
        color: #f5f7ff;
        text-align: left;
        font-size: 13px;
      }
      #workflow-context-menu button:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .toolbar-group {
        display: inline-flex;
        gap: 4px;
        background: rgba(255, 255, 255, 0.05);
        padding: 4px;
        border-radius: 999px;
      }
      .toolbar-group.align-controls {
        display: none;
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
        border: none;
        background: transparent;
        color: #1f1f24;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        padding: 4px 4px;
        min-width: 120px;
      }
      .port.port-input {
        flex-direction: row;
        justify-content: flex-start;
      }
      .port.port-output {
        flex-direction: row;
        justify-content: flex-end;
      }
      .port-label {
        font-weight: 600;
        font-size: 13px;
        color: #232329;
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
        display: none;
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
        display: none;
      }
      #project-json {
        display: none;
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
      #workflow-name-dialog {
        position: fixed;
        inset: 0;
        background: rgba(5, 8, 15, 0.76);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      #workflow-name-dialog[data-open='true'] {
        display: flex;
      }
      .workflow-dialog-card {
        width: min(360px, calc(100vw - 48px));
        background: rgba(10, 14, 22, 0.95);
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 20px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .workflow-dialog-card h3 {
        margin: 0;
        font-size: 18px;
      }
      #workflow-name-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(3, 6, 14, 0.9);
        color: inherit;
        font-size: 14px;
      }
      #workflow-name-input[data-invalid='true'] {
        border-color: rgba(255, 109, 122, 0.9);
        box-shadow: 0 0 0 1px rgba(255, 109, 122, 0.4);
      }
      .workflow-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .workflow-dialog-actions button {
        padding: 8px 16px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
      }
      .workflow-dialog-actions button.primary {
        background: rgba(99, 132, 255, 0.35);
        border-color: rgba(99, 132, 255, 0.55);
      }
      @media (max-width: 1100px) {
        main {
          --sidebar-collapsed-width: 56px;
          --sidebar-expanded-width: min(420px, calc(100vw - 80px));
        }
        .sidebar {
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .sidebar-icons {
          flex-direction: row;
          justify-content: center;
          width: auto;
        }
        .sidebar-icon.active {
          transform: translateY(-4px);
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
        <div class="workflow-dropdown">
          <button type="button" id="workflow-toggle" aria-haspopup="true" aria-expanded="false">
            <span id="workflow-name-label">Unsaved Workflow</span>
            <span class="chevron">▾</span>
          </button>
          <div id="workflow-menu" role="menu" aria-hidden="true">
            <button type="button" id="workflow-menu-rename" data-workflow-action="rename" data-i18n-key="workflow.menu.rename">Rename</button>
            <button type="button" id="workflow-menu-file-save" data-workflow-action="fileSave" data-i18n-key="workflow.menu.fileSave">File save</button>
            <button type="button" id="workflow-menu-file-load" data-workflow-action="fileLoad" data-i18n-key="workflow.menu.fileLoad">File load</button>
            <button type="button" id="workflow-menu-save-as" data-workflow-action="saveAs" data-i18n-key="workflow.menu.saveAs">Save as</button>
            <button type="button" id="workflow-menu-clear" data-workflow-action="clear" data-i18n-key="workflow.menu.clear">Clear workflow</button>
            <button type="button" id="workflow-menu-browse" data-workflow-action="browse" data-i18n-key="workflow.menu.openList">Browse workflows</button>
          </div>
        </div>
        <div class="toolbar-group align-controls">
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
        <div class="sidebar-icons" role="tablist">
          <button type="button" class="sidebar-icon" data-panel="panel-search" aria-controls="panel-search" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              ${NODE_SEARCH_ICON_SYMBOL}
            </span>
            <span class="sr-only">Search</span>
          </button>
          <button type="button" class="sidebar-icon" data-panel="panel-queue" aria-controls="panel-queue" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M19 12a7 7 0 1 1-2.05-4.95" />
                <polyline points="19 5 19 9 15 9" />
              </svg>
            </span>
            <span class="sr-only">Queue</span>
          </button>
          <button type="button" class="sidebar-icon" data-panel="panel-workflows" aria-controls="panel-workflows" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              ${WORKFLOW_PANEL_ICON_SYMBOL}
            </span>
            <span class="sr-only">Workflows</span>
          </button>
          <button type="button" class="sidebar-icon" data-panel="panel-connections" aria-controls="panel-connections" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              ${CONNECTION_PANEL_ICON_SYMBOL}
            </span>
            <span class="sr-only">Connections</span>
          </button>
          <button type="button" class="sidebar-icon" data-panel="panel-diagnostics" aria-controls="panel-diagnostics" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              <svg viewBox="0 0 24 24" role="presentation">
                <rect x="6" y="5" width="12" height="15" rx="2" />
                <path d="M9 3h6v3H9z" />
                <path d="M9 13l2.5 2.5L15 11" />
              </svg>
            </span>
            <span class="sr-only">Diagnostics</span>
          </button>
          <button type="button" class="sidebar-icon" data-panel="panel-about" aria-controls="panel-about" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              ${ABOUT_PANEL_ICON_SYMBOL}
            </span>
            <span class="sr-only">About</span>
          </button>
          <button type="button" class="sidebar-icon" data-panel="panel-help" aria-controls="panel-help" aria-expanded="false">
            <span aria-hidden="true" class="sidebar-icon-symbol">
              ${HELP_PANEL_ICON_SYMBOL}
            </span>
            <span class="sr-only">Help</span>
          </button>
        </div>
        <div class="sidebar-panel-container" id="sidebar-panels" data-state="closed">
          <div id="panel-search" class="sidebar-panel" role="region" aria-hidden="true">
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
          <div id="panel-help" class="sidebar-panel" role="region" aria-hidden="true">
            <div class="help-card" aria-live="polite">
              <strong data-i18n-key="help.shortcutsTitle">Shortcuts</strong>
              <table>
                <tr><td>Ctrl/Cmd + C</td><td data-i18n-key="help.copy">Copy node</td></tr>
                <tr><td>Ctrl/Cmd + V</td><td data-i18n-key="help.paste">Paste (4px snap)</td></tr>
                <tr><td>Ctrl/Cmd + D</td><td data-i18n-key="help.duplicate">Duplicate</td></tr>
                <tr><td>1</td><td data-i18n-key="help.zoomReset">Zoom 100%</td></tr>
                <tr><td>Shift + 1</td><td data-i18n-key="help.fitSelection">Fit selection</td></tr>
                <tr><td>⌥+= / ⌥+Shift+=</td><td data-i18n-key="help.zoomOut">Canvas zoom out</td></tr>
                <tr><td>⌥+〜 / ⌥+Shift+；</td><td data-i18n-key="help.zoomIn">Canvas zoom in</td></tr>
                <tr><td colspan="2" style="padding-top: 8px;"><strong data-i18n-key="nodes.trim.title">Trim</strong></td></tr>
                <tr><td>+ / = / ;</td><td data-i18n-key="nodes.trim.imageTools.zoomIn">Zoom in</td></tr>
                <tr><td>-</td><td data-i18n-key="nodes.trim.imageTools.zoomOut">Zoom out</td></tr>
                <tr><td>[ / ] / @</td><td data-i18n-key="nodes.trim.imageTools.rotate">Rotate</td></tr>
                <tr><td>H</td><td data-i18n-key="nodes.trim.imageTools.flipHorizontal">Flip horizontally</td></tr>
                <tr><td>V</td><td data-i18n-key="nodes.trim.imageTools.flipVertical">Flip vertically</td></tr>
                <tr><td>R</td><td data-i18n-key="nodes.trim.imageTools.reset">Reset transform</td></tr>
              </table>
            </div>
          </div>
          <div id="panel-queue" class="sidebar-panel" role="region" aria-hidden="true">
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
          </div>
          <div id="panel-workflows" class="sidebar-panel" role="region" aria-hidden="true">
            <div class="workflow-panel">
              <header>
                <strong data-i18n-key="workflows.title">Workflows</strong>
                <button type="button" id="workflow-create" data-i18n-key="workflows.saveCurrent">Save current workflow</button>
              </header>
              <label class="search-box">
                <span style="font-size:12px; color: rgba(255,255,255,0.7);" data-i18n-key="workflows.searchLabel">Search workflows</span>
                <input
                  type="search"
                  id="workflow-search"
                  placeholder="Search workflows…"
                  autocomplete="off"
                  data-i18n-attr-placeholder="workflows.searchPlaceholder"
                />
              </label>
              <div id="workflow-empty" data-i18n-key="workflows.empty">No saved workflows yet</div>
              <ul id="workflow-list"></ul>
            </div>
          </div>
          <div id="panel-connections" class="sidebar-panel" role="region" aria-hidden="true">
            <div class="connections-card" aria-label="Connection list" data-i18n-attr-aria-label="connections.ariaLabel">
              <header>
                <strong data-i18n-key="connections.title">Connections</strong>
                <span id="connection-pending" class="pending-hint" aria-live="polite"></span>
              </header>
              <ul id="connection-list" class="connections-list" role="list"></ul>
            </div>
          </div>
          <div id="panel-diagnostics" class="sidebar-panel" role="region" aria-hidden="true">
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
          </div>
          <div id="panel-about" class="sidebar-panel" role="region" aria-hidden="true">
            <div
              class="about-card"
              id="about-card"
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
                  <dt data-i18n-key="about.versionLabel">Version</dt>
                  <dd id="about-version"></dd>
                </div>
              </dl>
              <div class="about-links">
                <a id="about-license-link" href="#" target="_blank" rel="noreferrer" data-i18n-key="about.licenseLink">License</a>
                <a id="about-source-link" href="#" target="_blank" rel="noreferrer" data-i18n-key="about.sourceLink">Source</a>
              </div>
              <p id="about-notice"></p>
            </div>
          </div>
        </div>
      </section>
      <section class="canvas-wrap">
        <div id="canvas-grid" aria-hidden="true"></div>
        <div id="canvas" role="region" aria-label="Node canvas" data-i18n-attr-aria-label="canvas.ariaLabel">
          <svg id="connection-layer" aria-hidden="true"></svg>
          <div id="node-layer"></div>
          <div id="selection-rect" aria-hidden="true"></div>
          <div id="selection-outline" aria-hidden="true"></div>
        </div>
        <div
          class="canvas-controls"
          id="canvas-controls"
          role="toolbar"
          aria-label="Canvas controls"
          data-i18n-attr-aria-label="canvas.controls"
        >
          <button
            type="button"
            id="tool-select"
            class="canvas-tool active"
            aria-pressed="true"
            title="Select tool"
            data-i18n-attr-title="canvas.toolSelectTooltip"
            data-i18n-attr-aria-label="canvas.toolSelectTooltip"
          >
            <span aria-hidden="true" class="canvas-tool-icon">${SELECT_TOOL_ICON_SYMBOL}</span>
          </button>
          <button
            type="button"
            id="tool-pan"
            class="canvas-tool"
            aria-pressed="false"
            title="Pan view"
            data-i18n-attr-title="canvas.toolPanTooltip"
            data-i18n-attr-aria-label="canvas.toolPanTooltip"
          >
            <span aria-hidden="true" class="canvas-tool-icon">${PAN_TOOL_ICON_SYMBOL}</span>
          </button>
          <button
            type="button"
            id="btn-fit-view"
            class="canvas-tool"
            title="Fit selection"
            data-i18n-attr-title="canvas.fitViewTooltip"
            data-i18n-attr-aria-label="canvas.fitViewTooltip"
          >
            <span aria-hidden="true" class="canvas-tool-icon">${FIT_TOOL_ICON_SYMBOL}</span>
          </button>
          <span class="canvas-controls-divider" aria-hidden="true"></span>
          <div class="zoom-control">
            <button
              type="button"
              id="zoom-display"
              aria-haspopup="true"
              aria-expanded="false"
              title="Adjust zoom"
              data-i18n-attr-title="canvas.zoomDisplayLabel"
              data-i18n-attr-aria-label="canvas.zoomDisplayLabel"
            >
              100%
            </button>
            <div id="zoom-menu" role="menu" aria-hidden="true">
              <button type="button" id="zoom-in" role="menuitem" data-i18n-key="canvas.zoomIn">Zoom in</button>
              <button type="button" id="zoom-out" role="menuitem" data-i18n-key="canvas.zoomOut">Zoom out</button>
              <button type="button" id="zoom-fit-menu" role="menuitem" data-i18n-key="canvas.zoomToFit">Zoom to fit</button>
              <hr />
              <div class="zoom-input-row">
                <input
                  type="number"
                  id="zoom-input"
                  inputmode="numeric"
                  min="25"
                  max="400"
                  aria-label="Zoom percent"
                  data-i18n-attr-aria-label="canvas.zoomInputLabel"
                  placeholder="230"
                  data-i18n-attr-placeholder="canvas.zoomInputPlaceholder"
                />
                <button type="button" id="zoom-apply" role="menuitem" data-i18n-key="canvas.zoomApply">Apply</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <section id="json-panel" hidden aria-hidden="true">
      <textarea
        id="project-json"
        spellcheck="false"
        aria-label="JSON for save/load"
        data-i18n-attr-aria-label="json.editorLabel"
        hidden
      ></textarea>
    </section>
    <div id="toast" role="status" aria-live="assertive"></div>
    <div id="workflow-context-menu" role="menu" aria-hidden="true">
      <button type="button" id="workflow-context-delete" data-i18n-key="workflow.context.delete">Delete workflow</button>
    </div>
    <div id="workflow-name-dialog" role="dialog" aria-modal="true" aria-hidden="true">
      <div class="workflow-dialog-card" role="document">
        <h3 id="workflow-name-title" data-i18n-key="workflow.modal.title">Workflow name</h3>
        <input
          type="text"
          id="workflow-name-input"
          autocomplete="off"
          data-i18n-attr-placeholder="workflow.modal.placeholder"
        />
        <div class="workflow-dialog-actions">
          <button type="button" id="workflow-name-cancel" data-i18n-key="workflow.modal.cancel">Cancel</button>
          <button type="button" class="primary" id="workflow-name-confirm" data-i18n-key="workflow.modal.confirm">Save</button>
        </div>
      </div>
    </div>
${scriptTags}
  </body>
</html>`;
};

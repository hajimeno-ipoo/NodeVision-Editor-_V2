import type { EditorNode, NodeTemplate } from '@nodevision/editor';

import type { BootStatus, DiagnosticsSnapshot, QueueSnapshot } from './types';

export interface RendererPayload {
  status: BootStatus;
  templates: NodeTemplate[];
  nodes: EditorNode[];
  queue: QueueSnapshot;
  diagnostics: DiagnosticsSnapshot;
}

const encodePayload = (payload: RendererPayload): string =>
  encodeURIComponent(JSON.stringify(payload));

export const buildRendererHtml = (payload: RendererPayload): string => {
  const encoded = encodePayload(payload);
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>NodeVision Editor</title>
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
      }
      header {
        padding: 16px 24px;
        background: #12131a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: radial-gradient(circle at top, rgba(21, 113, 255, 0.2), transparent 65%);
      }
      .canvas-wrap {
        position: relative;
        overflow: hidden;
      }
      #canvas {
        position: absolute;
        inset: 0;
        background-color: #0f1117;
        background-image: linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
        background-size: 8px 8px;
        cursor: grab;
        transform-origin: 0 0;
      }
      #canvas.zooming {
        cursor: zoom-in;
      }
      .node {
        position: absolute;
        border-radius: 12px;
        padding: 12px 14px;
        min-width: 200px;
        min-height: 100px;
        background: rgba(19, 23, 32, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(8px);
        color: #f8fafc;
        transition: border 120ms ease, box-shadow 120ms ease;
      }
      .node h3 {
        margin: 0 0 6px;
        font-size: 16px;
      }
      .node p {
        margin: 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
      }
      .node.selected {
        border-color: #4e9eff;
        box-shadow: 0 0 0 2px rgba(78, 158, 255, 0.3);
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
      .diagnostics-card {
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
      .diagnostics-card header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
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
          <button type="button" data-align="left">左揃え</button>
          <button type="button" data-align="top">上揃え</button>
          <button type="button" data-align="center">中央揃え</button>
        </div>
        <div class="toolbar-group">
          <button type="button" id="btn-undo">Undo</button>
          <button type="button" id="btn-redo">Redo</button>
        </div>
        <div class="toolbar-group">
          <label style="display:flex;gap:6px;align-items:center;font-size:12px;">
            <input type="checkbox" id="running-toggle" /> 実行中モード
          </label>
        </div>
        <span id="autosave-indicator" aria-live="polite">変更待ち…</span>
      </div>
    </header>
    <main>
      <section class="sidebar" aria-label="ノード検索とヘルプ">
        <div>
          <label class="search-box">
            <span style="font-size:12px; color: rgba(255,255,255,0.7);">ノード検索</span>
            <input id="node-search" type="search" placeholder="Load, Trim, Resize..." autocomplete="off" />
          </label>
          <ul id="search-suggestions" class="suggestions" role="listbox" aria-label="ノード候補"></ul>
        </div>
        <div class="help-card" aria-live="polite">
          <strong>ショートカット</strong>
          <table>
            <tr><td>Ctrl/Cmd + C</td><td>ノードをコピー</td></tr>
            <tr><td>Ctrl/Cmd + V</td><td>貼り付け（4pxスナップ）</td></tr>
            <tr><td>Ctrl/Cmd + D</td><td>複製</td></tr>
            <tr><td>1</td><td>ズーム 100%</td></tr>
            <tr><td>Shift + 1</td><td>選択範囲にフィット</td></tr>
          </table>
        </div>
        <div class="help-card">
          <strong>操作ガイド</strong>
          <p>・ドラッグでノード移動（4pxスナップ）<br />・Enterで候補を追加<br />・Tabでカードにフォーカスできます。</p>
        </div>
        <div class="readonly-banner" id="readonly-banner">スキーマ差分のため読み取り専用です（編集は無効化）。</div>
        <div class="queue-card" aria-label="ジョブキュー">
          <header>
            <strong>ジョブキュー</strong>
            <div class="toolbar-group">
              <button type="button" id="btn-demo-job">デモジョブ追加</button>
              <button type="button" id="btn-cancel-all">Cancel All</button>
            </div>
          </header>
          <div id="queue-warnings" class="queue-alerts" aria-live="polite"></div>
          <div class="queue-lists">
            <div class="queue-section">
              <strong>実行中</strong>
              <div id="queue-running"></div>
            </div>
            <div class="queue-section">
              <strong>待機中</strong>
              <div id="queue-queued"></div>
            </div>
            <div class="queue-section">
              <strong>履歴 (20件)</strong>
              <div id="queue-history"></div>
            </div>
          </div>
        </div>
        <div class="diagnostics-card" aria-label="ログと診断">
          <header>
            <strong>ログ & 診断</strong>
            <label style="display:flex;gap:6px;align-items:center;">
              <input type="checkbox" id="crash-consent" /> クラッシュダンプを含める
            </label>
          </header>
          <div class="diagnostics-export">
            <input type="password" id="log-password" placeholder="Export password" autocomplete="off" />
            <button type="button" id="btn-export-logs">Export Logs</button>
          </div>
          <div id="export-status"></div>
          <div class="queue-section">
            <strong>inspect履歴 (20件)</strong>
            <div id="inspect-history"></div>
          </div>
        </div>
      </section>
      <section class="canvas-wrap">
        <div id="canvas" role="region" aria-label="ノードキャンバス"></div>
      </section>
    </main>
    <section id="json-panel">
      <div>
        <div class="banner" style="margin-bottom:10px;">JSONプロジェクトの保存/読み込みはここから。schemaVersion=1.0.7 を保持します。</div>
        <textarea id="project-json" spellcheck="false" aria-label="保存用JSON"></textarea>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button type="button" id="btn-export">JSONを書き出し</button>
        <button type="button" id="btn-load">JSONを読み込み</button>
      </div>
    </section>
    <div id="toast" role="status" aria-live="assertive"></div>
    <script>
      const BOOTSTRAP = JSON.parse(decodeURIComponent('${encoded}'));
      const GRID = 8;
      const SNAP = 4;
      const SCHEMA = '1.0.7';
      const elements = {
        statusList: document.getElementById('status-list'),
        canvas: document.getElementById('canvas'),
        searchInput: document.getElementById('node-search'),
        suggestions: document.getElementById('search-suggestions'),
        autosave: document.getElementById('autosave-indicator'),
        undo: document.getElementById('btn-undo'),
        redo: document.getElementById('btn-redo'),
        json: document.getElementById('project-json'),
        export: document.getElementById('btn-export'),
        load: document.getElementById('btn-load'),
        runningToggle: document.getElementById('running-toggle'),
        readonlyBanner: document.getElementById('readonly-banner'),
        queueRunning: document.getElementById('queue-running'),
        queueQueued: document.getElementById('queue-queued'),
        queueHistory: document.getElementById('queue-history'),
        queueWarnings: document.getElementById('queue-warnings'),
        crashConsent: document.getElementById('crash-consent'),
        logPassword: document.getElementById('log-password'),
        exportLogs: document.getElementById('btn-export-logs'),
        exportStatus: document.getElementById('export-status'),
        inspectHistory: document.getElementById('inspect-history'),
        demoJob: document.getElementById('btn-demo-job'),
        cancelAll: document.getElementById('btn-cancel-all'),
        toast: document.getElementById('toast')
      };

      const deepClone = value => JSON.parse(JSON.stringify(value));

      const DEFAULT_QUEUE_LIMITS = {
        maxParallelJobs: 1,
        maxQueueLength: 4,
        queueTimeoutMs: 180_000
      };

      const state = {
        nodes: (BOOTSTRAP.nodes ?? []).map(node => deepClone(node)),
        selection: new Set(),
        clipboard: [],
        zoom: 1,
        history: [],
        historyIndex: -1,
        autosaveTimer: null,
        lastAutosave: null,
        isRunning: false,
        readonly: false,
        queue: {
          active: BOOTSTRAP.queue?.active ?? [],
          queued: BOOTSTRAP.queue?.queued ?? [],
          history: BOOTSTRAP.queue?.history ?? [],
          warnings: BOOTSTRAP.queue?.warnings ?? [],
          limits: BOOTSTRAP.queue?.limits ?? DEFAULT_QUEUE_LIMITS
        },
        diagnostics: {
          collectCrashDumps: BOOTSTRAP.diagnostics?.collectCrashDumps ?? false,
          lastTokenPreview: BOOTSTRAP.diagnostics?.lastTokenPreview ?? null,
          lastLogExportPath: BOOTSTRAP.diagnostics?.lastLogExportPath ?? null,
          lastExportSha: BOOTSTRAP.diagnostics?.lastExportSha ?? null,
          inspectHistory: BOOTSTRAP.diagnostics?.inspectHistory ?? []
        }
      };

      const templates = BOOTSTRAP.templates ?? [];

      const describeStatus = status => {
        switch (status) {
          case 'running':
            return '実行中';
          case 'queued':
            return '待機中';
          case 'coolingDown':
            return 'CoolingDown';
          case 'failed':
            return '失敗';
          case 'canceled':
            return 'Cancel済み';
          default:
            return status;
        }
      };

      const escapeHtml = value =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const formatTimestamp = milliseconds => {
        if (typeof milliseconds !== 'number' || Number.isNaN(milliseconds)) {
          return '—';
        }
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
      };

      const formatIsoTime = value => {
        if (!value) {
          return '—';
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
      };

      const logLevelClass = level => {
        if (level === 'error') return 'log-error';
        if (level === 'warn') return 'log-warn';
        return 'log-info';
      };

      const showToast = (message, type = 'info') => {
        if (!elements.toast) return;
        elements.toast.textContent = message;
        elements.toast.classList.remove('error');
        if (type === 'error') {
          elements.toast.classList.add('error');
        }
        elements.toast.classList.add('visible');
        setTimeout(() => elements.toast.classList.remove('visible'), 3000);
      };

      const renderQueue = () => {
        const renderJobs = (container, jobs, emptyMessage) => {
          if (!container) return;
          if (!jobs?.length) {
            container.innerHTML = `<p style="margin:4px 0;opacity:0.7;">${emptyMessage}</p>`;
            return;
          }
          container.innerHTML = jobs
            .map(job => `<div class="queue-row"><span>${escapeHtml(job.name ?? job.jobId ?? 'ジョブ')}</span><span class="queue-badge">${describeStatus(job.status)}</span></div>`)
            .join('');
        };

        renderJobs(elements.queueRunning, state.queue.active, '実行中のジョブはありません');
        renderJobs(elements.queueQueued, state.queue.queued, '待機ジョブなし');
        renderQueueHistory();
        renderQueueWarnings();
      };

      const renderQueueHistory = () => {
        if (!elements.queueHistory) return;
        const history = (state.queue.history ?? []).slice(0, 20);
        if (!history.length) {
          elements.queueHistory.innerHTML = '<p style="opacity:0.7;">履歴はまだありません</p>';
          return;
        }
        elements.queueHistory.innerHTML = history
          .map(entry => {
            const level = entry.logLevel ?? 'info';
            const message = entry.message ? escapeHtml(entry.message) : 'ログなし';
            const finishedAt = entry.finishedAt ?? entry.startedAt ?? null;
            return `
              <div class="history-row">
                <div class="history-row-main">
                  <span class="history-job">${escapeHtml(entry.name ?? 'ジョブ')}</span>
                  <span class="queue-badge">${describeStatus(entry.status)}</span>
                  <span class="log-level-badge ${logLevelClass(level)}">${level.toUpperCase()}</span>
                  <span class="history-time">${formatTimestamp(finishedAt)}</span>
                </div>
                <p class="history-message">${message}</p>
              </div>
            `;
          })
          .join('');
      };

      const renderQueueWarnings = () => {
        if (!elements.queueWarnings) return;
        const warnings = state.queue.warnings ?? [];
        const limits = state.queue.limits ?? DEFAULT_QUEUE_LIMITS;
        if (!warnings.length) {
          const timeoutSeconds = Math.round((limits.queueTimeoutMs ?? 0) / 1000);
          elements.queueWarnings.innerHTML = `
            <div class="queue-warning queue-warning-info">
              <strong>Queue Stable</strong>
              <span>待機 ${state.queue.queued?.length ?? 0}/${limits.maxQueueLength} ・ Timeout ${timeoutSeconds || '0'}秒</span>
            </div>
          `;
          return;
        }
        elements.queueWarnings.innerHTML = warnings
          .map(warning => {
            const levelClass = warning.level === 'error' ? 'queue-warning-error' : warning.level === 'warn' ? 'queue-warning-warn' : 'queue-warning-info';
            return `
              <div class="queue-warning ${levelClass}">
                <strong>${warning.type}</strong>
                <span>${escapeHtml(warning.message)}</span>
                <span class="history-time">${formatIsoTime(warning.occurredAt)}</span>
              </div>
            `;
          })
          .join('');
      };

      const renderDiagnostics = () => {
        if (elements.crashConsent) {
          elements.crashConsent.checked = !!state.diagnostics.collectCrashDumps;
        }
        if (elements.exportStatus) {
          if (state.diagnostics.lastLogExportPath) {
            elements.exportStatus.textContent = `Last export: ${state.diagnostics.lastLogExportPath} (${state.diagnostics.lastExportSha ?? 'sha?'})`;
          } else {
            elements.exportStatus.textContent = 'まだエクスポートしていません';
          }
        }
        if (elements.inspectHistory) {
          const rows = (state.diagnostics.inspectHistory ?? [])
            .slice(0, 20)
            .map(item => {
              const level = item.logLevel ?? 'info';
              const infoParts = [
                `HTTP ${item.statusCode}`,
                item.responseCode ?? null,
                typeof item.clipCount === 'number' ? `${item.clipCount} clips` : null,
                item.remoteAddress ?? null
              ].filter(Boolean);
              return `
                <div class="inspect-row">
                  <div class="inspect-row-main">
                    <span class="log-level-badge ${logLevelClass(level)}">${level.toUpperCase()}</span>
                    <span class="history-time">${formatIsoTime(item.timestamp)}</span>
                  </div>
                  <div class="inspect-row-meta">
                    <strong>${escapeHtml(item.tokenLabel ?? 'token?')}</strong>
                    <span>${infoParts.map(part => escapeHtml(part)).join(' · ') || '詳細なし'}</span>
                  </div>
                </div>
              `;
            })
            .join('');
          elements.inspectHistory.innerHTML = rows || '<p style="opacity:0.7;">履歴はまだありません</p>';
        }
      };

      const refreshQueue = async () => {
        if (!window.nodevision?.getQueueSnapshot) return;
        try {
          const snapshot = await window.nodevision.getQueueSnapshot();
          if (snapshot) {
            state.queue = {
              active: snapshot.active ?? [],
              queued: snapshot.queued ?? [],
              history: snapshot.history ?? [],
              warnings: snapshot.warnings ?? [],
              limits: snapshot.limits ?? state.queue.limits ?? DEFAULT_QUEUE_LIMITS
            };
            renderQueue();
          }
        } catch (error) {
          showToast(`キュー更新に失敗: ${error?.message ?? error}`, 'error');
        }
      };

      const snap = value => Math.round(value / SNAP) * SNAP;

      const createId = base =>
        (crypto?.randomUUID ? crypto.randomUUID() : \`${base}-\${Date.now()}-\${Math.floor(Math.random() * 9999)}\`);

      const renderStatus = () => {
        const items = [
          \`<li>FFmpeg: <strong>\${BOOTSTRAP.status.ffmpeg.ffmpeg.path}</strong></li>\`,
          \`<li>FFprobe: <strong>\${BOOTSTRAP.status.ffmpeg.ffprobe.path}</strong></li>\`,
          \`<li>tempRoot: \${BOOTSTRAP.status.settings.tempRoot}</li>\`,
          \`<li>HTTP Port: \${BOOTSTRAP.status.settings.http.port}</li>\`,
          \`<li>Token Label: \${BOOTSTRAP.status.token.label}</li>\`
        ];
        elements.statusList.innerHTML = items.join('');
      };

      const setAutosaveMessage = msg => {
        elements.autosave.textContent = msg;
      };

      const scheduleAutosave = () => {
        if (!state.autosaveTimer) {
          setAutosaveMessage(state.isRunning ? '実行中…変更を監視中 (10s)' : '変更検知 (2s)');
        }
        const delay = state.isRunning ? 10_000 : 2_000;
        clearTimeout(state.autosaveTimer);
        state.autosaveTimer = setTimeout(() => {
          state.lastAutosave = new Date();
          setAutosaveMessage(\`Autosaved \${state.lastAutosave.toLocaleTimeString()}\`);
          state.autosaveTimer = null;
        }, delay);
      };

      const pushHistory = () => {
        state.history.splice(state.historyIndex + 1);
        state.history.push(deepClone({ nodes: state.nodes }));
        if (state.history.length > 100) {
          state.history.shift();
        }
        state.historyIndex = state.history.length - 1;
        updateUndoRedoState();
      };

      const applySnapshot = snapshot => {
        state.nodes = deepClone(snapshot.nodes);
        state.selection.clear();
        renderNodes();
        updateSelectionUi();
        updateJsonPreview();
      };

      const updateUndoRedoState = () => {
        elements.undo.disabled = state.historyIndex <= 0;
        elements.redo.disabled = state.historyIndex >= state.history.length - 1;
      };

      const undo = () => {
        if (state.historyIndex <= 0) return;
        state.historyIndex -= 1;
        applySnapshot(state.history[state.historyIndex]);
      };

      const redo = () => {
        if (state.historyIndex >= state.history.length - 1) return;
        state.historyIndex += 1;
        applySnapshot(state.history[state.historyIndex]);
      };

      const selectionArray = () => Array.from(state.selection);

      const updateSelectionUi = () => {
        document.querySelectorAll('.node').forEach(nodeEl => {
          const id = nodeEl.dataset.id;
          nodeEl.classList.toggle('selected', state.selection.has(id));
        });
        document.querySelectorAll('[data-align]').forEach(button => {
          button.disabled = state.selection.size === 0 || state.readonly;
        });
      };

      const renderNodes = () => {
        elements.canvas.innerHTML = '';
        state.nodes.forEach(node => {
          const el = document.createElement('div');
          el.className = 'node';
          el.dataset.id = node.id;
          el.tabIndex = 0;
          el.style.transform = \
            \`translate(\${node.position.x}px, \${node.position.y}px)\`;
          el.innerHTML = \
            \`<h3>\${node.title}</h3><p>typeId: \${node.typeId}<br/>nodeVersion: \${node.nodeVersion}</p>\`;
          if (state.selection.has(node.id)) {
            el.classList.add('selected');
          }
          attachNodeEvents(el, node);
          elements.canvas.appendChild(el);
        });
      };

      const attachNodeEvents = (el, node) => {
        const onPointerDown = event => {
          if (state.readonly) return;
          if (event.button !== 0) return;
          event.preventDefault();
          const rect = elements.canvas.getBoundingClientRect();
          const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          const offset = {
            x: start.x - node.position.x,
            y: start.y - node.position.y
          };
          const move = moveEvent => {
            const current = { x: moveEvent.clientX - rect.left, y: moveEvent.clientY - rect.top };
            node.position.x = snap(current.x - offset.x);
            node.position.y = snap(current.y - offset.y);
            el.style.transform = \
              \`translate(\${node.position.x}px, \${node.position.y}px)\`;
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            commitState();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };

        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('click', event => {
          if (state.readonly) return;
          const additive = event.shiftKey;
          if (!additive) {
            state.selection.clear();
          }
          if (state.selection.has(node.id) && additive) {
            state.selection.delete(node.id);
          } else {
            state.selection.add(node.id);
          }
          updateSelectionUi();
        });
        el.addEventListener('keydown', event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            el.click();
          }
        });
      };

      const commitState = () => {
        renderNodes();
        updateSelectionUi();
        updateJsonPreview();
        pushHistory();
        scheduleAutosave();
      };

      const serializeProject = () => ({
        schemaVersion: SCHEMA,
        nodes: state.nodes.map(node => ({
          id: node.id,
          typeId: node.typeId,
          nodeVersion: node.nodeVersion,
          title: node.title,
          position: node.position
        })),
        metadata: {
          name: 'NodeVision Demo',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          readonly: state.readonly
        }
      });

      const updateJsonPreview = () => {
        elements.json.value = JSON.stringify(serializeProject(), null, 2);
      };

      const addNodeFromTemplate = template => {
        const position = { x: snap(120 + Math.random() * 320), y: snap(80 + Math.random() * 220) };
        const node = {
          id: createId(template.typeId),
          typeId: template.typeId,
          nodeVersion: template.nodeVersion,
          title: template.title,
          position,
          width: template.width ?? 220,
          height: template.height ?? 120
        };
        state.nodes.push(node);
        state.selection = new Set([node.id]);
        commitState();
      };

      const updateSuggestions = query => {
        const normalized = query.trim().toLowerCase();
        const results = templates.filter(template => {
          if (!normalized) return true;
          return (
            template.title.toLowerCase().includes(normalized) ||
            template.keywords.some(keyword => keyword.toLowerCase().includes(normalized))
          );
        }).slice(0, 6);
        elements.suggestions.innerHTML = '';
        results.forEach((template, index) => {
          const li = document.createElement('li');
          li.role = 'option';
          li.id = \
            \`suggestion-\${index}\`;
          li.textContent = \
            \`\${template.title} — \${template.description}\`;
          li.addEventListener('click', () => addNodeFromTemplate(template));
          elements.suggestions.appendChild(li);
        });
        return results;
      };

      const copySelection = () => {
        if (!state.selection.size) return;
        state.clipboard = state.nodes
          .filter(node => state.selection.has(node.id))
          .map(node => deepClone(node));
      };

      const pasteSelection = (offset = { x: 40, y: 40 }) => {
        if (!state.clipboard.length || state.readonly) return;
        const newNodes = state.clipboard.map((node, index) => ({
          ...deepClone(node),
          id: createId(node.typeId + '-' + index),
          position: {
            x: snap(node.position.x + offset.x),
            y: snap(node.position.y + offset.y)
          }
        }));
        state.nodes.push(...newNodes);
        state.selection = new Set(newNodes.map(node => node.id));
        commitState();
      };

      const duplicateSelection = () => {
        copySelection();
        pasteSelection({ x: 24, y: 24 });
      };

      const alignSelection = mode => {
        if (!state.selection.size) return;
        const nodes = state.nodes.filter(node => state.selection.has(node.id));
        if (!nodes.length) return;
        const aligners = {
          left: () => Math.min(...nodes.map(node => node.position.x)),
          top: () => Math.min(...nodes.map(node => node.position.y)),
          center: () => (
            nodes.reduce((sum, node) => sum + node.position.x + (node.width ?? 200) / 2, 0) / nodes.length
          )
        };
        if (mode === 'left') {
          const minX = aligners.left();
          nodes.forEach(node => (node.position.x = snap(minX)));
        } else if (mode === 'top') {
          const minY = aligners.top();
          nodes.forEach(node => (node.position.y = snap(minY)));
        } else if (mode === 'center') {
          const center = aligners.center();
          nodes.forEach(node => (node.position.x = snap(center - (node.width ?? 200) / 2)));
        }
        commitState();
      };

      const setZoom = value => {
        state.zoom = Math.min(2, Math.max(0.25, value));
        elements.canvas.style.transform = \
          \`scale(\${state.zoom})\`;
      };

      const fitSelection = () => {
        if (!state.selection.size) {
          setZoom(1);
          return;
        }
        const nodes = state.nodes.filter(node => state.selection.has(node.id));
        const minX = Math.min(...nodes.map(node => node.position.x));
        const maxX = Math.max(...nodes.map(node => node.position.x + (node.width ?? 200)));
        const minY = Math.min(...nodes.map(node => node.position.y));
        const maxY = Math.max(...nodes.map(node => node.position.y + (node.height ?? 120)));
        const boxWidth = maxX - minX + 64;
        const boxHeight = maxY - minY + 64;
        const viewWidth = elements.canvas.clientWidth || 900;
        const viewHeight = elements.canvas.clientHeight || 600;
        const scale = Math.min(viewWidth / boxWidth, viewHeight / boxHeight, 1);
        setZoom(scale);
      };

      const serializeAndDownload = () => {
        const blob = new Blob([elements.json.value], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = \`nodevision-project-\${Date.now()}.json\`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };

      const loadFromTextarea = () => {
        try {
          const parsed = JSON.parse(elements.json.value);
          if (!parsed.schemaVersion) {
            throw new Error('schemaVersion がありません');
          }
          state.readonly = parsed.schemaVersion !== SCHEMA;
          state.nodes = (parsed.nodes ?? []).map(node => ({
            id: node.id,
            typeId: node.typeId,
            nodeVersion: node.nodeVersion ?? '1.0.0',
            title: node.title ?? node.typeId,
            position: {
              x: snap(node.position?.x ?? 0),
              y: snap(node.position?.y ?? 0)
            },
            width: 220,
            height: 120
          }));
          state.selection.clear();
          updateReadonlyUi();
          commitState();
        } catch (error) {
          alert('JSONの読み込みに失敗しました: ' + error.message);
        }
      };

      const updateReadonlyUi = () => {
        document.body.classList.toggle('readonly', state.readonly);
      };

      const handleKeydown = event => {
        const modifier = event.metaKey || event.ctrlKey;
        if (modifier && event.key.toLowerCase() === 'c') {
          event.preventDefault();
          copySelection();
        } else if (modifier && event.key.toLowerCase() === 'v') {
          event.preventDefault();
          pasteSelection();
        } else if (modifier && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          duplicateSelection();
        } else if (event.key === '1' && !event.shiftKey && !modifier) {
          setZoom(1);
        } else if (event.key === '1' && event.shiftKey) {
          fitSelection();
        }
      };

      elements.searchInput.addEventListener('input', event => updateSuggestions(event.target.value));
      elements.searchInput.addEventListener('keydown', event => {
        const results = updateSuggestions(elements.searchInput.value);
        if (event.key === 'Enter' && results.length) {
          addNodeFromTemplate(results[0]);
          elements.searchInput.select();
        }
      });

      document.querySelectorAll('[data-align]').forEach(button => {
        button.addEventListener('click', event => {
          const mode = event.currentTarget.getAttribute('data-align');
          alignSelection(mode);
        });
      });

      elements.export.addEventListener('click', serializeAndDownload);
      elements.load.addEventListener('click', loadFromTextarea);
      elements.undo.addEventListener('click', undo);
      elements.redo.addEventListener('click', redo);
      elements.runningToggle.addEventListener('change', event => {
        state.isRunning = event.target.checked;
        scheduleAutosave();
      });

      const enqueueDemoJob = async () => {
        if (!window.nodevision?.enqueueDemoJob) {
          showToast('デモジョブAPIがみつからないよ', 'error');
          return;
        }
        const response = await window.nodevision.enqueueDemoJob({ name: 'FFmpeg 合成' });
        if (response?.ok) {
          showToast('デモジョブを追加したよ');
        } else if (response?.code === 'QUEUE_FULL') {
          showToast('QUEUE_FULL: 待機キューが満杯だよ', 'error');
        } else {
          showToast(response?.error ?? 'ジョブ追加に失敗したよ', 'error');
        }
        refreshQueue();
      };

      const cancelAllJobs = async () => {
        if (!window.nodevision?.cancelAllJobs) return;
        await window.nodevision.cancelAllJobs();
        showToast('全ジョブをキャンセルしたよ');
        refreshQueue();
      };

      const exportLogs = async () => {
        if (!window.nodevision?.exportLogs) {
          showToast('Export APIが未接続だよ', 'error');
          return;
        }
        const password = elements.logPassword?.value?.trim() || null;
        const response = await window.nodevision.exportLogs(password);
        if (response?.ok) {
          if (response.diagnostics) {
            state.diagnostics = response.diagnostics;
            renderDiagnostics();
          }
          const exportPath = response.result?.outputPath ?? 'diagnostics folder';
          const sha = response.result?.sha256 ?? state.diagnostics.lastExportSha ?? null;
          const shaLabel = sha ? ` (SHA256: ${sha})` : '';
          showToast(`Logs exported to ${exportPath}${shaLabel}`);
        } else {
          showToast(response?.message ?? 'エクスポートに失敗したよ', 'error');
        }
      };

      elements.demoJob?.addEventListener('click', enqueueDemoJob);
      elements.cancelAll?.addEventListener('click', cancelAllJobs);
      elements.exportLogs?.addEventListener('click', exportLogs);
      elements.crashConsent?.addEventListener('change', async event => {
        if (!window.nodevision?.setCrashDumpConsent) return;
        const enabled = event.target.checked;
        const result = await window.nodevision.setCrashDumpConsent(enabled);
        state.diagnostics.collectCrashDumps = result.collectCrashDumps;
        renderDiagnostics();
        showToast(result.collectCrashDumps ? 'クラッシュダンプを含めるよ' : 'クラッシュダンプを除外するよ');
      });

      document.addEventListener('keydown', handleKeydown);

      renderStatus();
      renderNodes();
      updateSuggestions('');
      pushHistory();
      updateJsonPreview();
      renderQueue();
      renderDiagnostics();
      refreshQueue();
      setInterval(refreshQueue, 4000);
    </script>
  </body>
</html>`;
};

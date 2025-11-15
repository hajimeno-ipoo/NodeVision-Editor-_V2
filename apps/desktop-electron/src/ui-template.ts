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

const UI_TRANSLATIONS = {
  'en-US': {
    'app.title': 'NodeVision Editor',
    'toolbar.alignLeft': 'Align left',
    'toolbar.alignTop': 'Align top',
    'toolbar.alignCenter': 'Align center',
    'toolbar.undo': 'Undo',
    'toolbar.redo': 'Redo',
    'toolbar.runningMode': 'Running mode',
    'toolbar.localeLabel': 'Language',
    'toolbar.locale.en': 'English',
    'toolbar.locale.ja': 'Japanese',
    'autosave.pending': 'Waiting for changes...',
    'autosave.running': 'Monitoring changes while running ({{seconds}}s)',
    'autosave.idle': 'Watching for edits ({{seconds}}s)',
    'autosave.saved': 'Autosaved at {{time}}',
    'sidebar.ariaLabel': 'Node search and help',
    'sidebar.searchLabel': 'Node search',
    'sidebar.searchPlaceholder': 'Load, Trim, Resize...',
    'sidebar.suggestionsLabel': 'Node suggestions',
    'help.shortcutsTitle': 'Shortcuts',
    'help.copy': 'Copy node',
    'help.paste': 'Paste (4px snap)',
    'help.duplicate': 'Duplicate',
    'help.zoomReset': 'Zoom 100%',
    'help.fitSelection': 'Fit selection',
    'help.guideTitle': 'Guided actions',
    'help.guideHtml': '• Drag nodes to move (4px snap)<br />• Press Enter to add highlighted suggestions<br />• Use Tab to focus cards.',
    'readonly.banner': 'Read-only because the schema version differs. Editing is disabled.',
    'queue.ariaLabel': 'Job queue',
    'queue.title': 'Job queue',
    'queue.demoJob': 'Add demo job',
    'queue.cancelAll': 'Cancel all',
    'queue.status.running': 'Running',
    'queue.status.queued': 'Queued',
    'queue.status.coolingDown': 'Cooling down',
    'queue.status.failed': 'Failed',
    'queue.status.canceled': 'Canceled',
    'queue.historyTitle': 'History (20 entries)',
    'queue.emptyActive': 'No active jobs',
    'queue.emptyQueued': 'No queued jobs',
    'queue.noHistory': 'No history yet',
    'queue.noLogs': 'No logs yet',
    'queue.defaultJob': 'Job',
    'queue.stableTitle': 'Queue Stable',
    'queue.stableSummary': 'Queued {{queued}}/{{limit}} • Timeout {{timeout}}s',
    'nodes.ariaLabel': '{{title}} node',
    'ports.inputsLabel': '{{title}} inputs',
    'ports.outputsLabel': '{{title}} outputs',
    'ports.emptyInputs': 'No inputs',
    'ports.emptyOutputs': 'No outputs',
    'ports.direction.input': 'Input',
    'ports.direction.output': 'Output',
    'ports.portLabel': '{{direction}} port {{label}} ({{dataType}})',
    'connections.title': 'Connections',
    'connections.ariaLabel': 'Connection list',
    'connections.empty': 'No connections yet',
    'connections.remove': 'Remove connection',
    'connections.itemLabel': '{{from}} → {{to}}',
    'connections.pending': 'Select an input port to finish connection from {{from}}',
    'diagnostics.ariaLabel': 'Logs and diagnostics',
    'diagnostics.title': 'Logs & diagnostics',
    'diagnostics.crashConsent': 'Include crash dumps',
    'diagnostics.passwordPlaceholder': 'Export password',
    'diagnostics.exportButton': 'Export logs',
    'diagnostics.inspectHistoryTitle': 'Inspect history (20 entries)',
    'diagnostics.noExport': 'No exports yet',
    'diagnostics.lastExport': 'Last export: {{path}} (SHA {{sha}})',
    'diagnostics.unknownSha': 'unknown',
    'diagnostics.historyEmpty': 'No inspect history yet',
    'diagnostics.noDetails': 'No details',
    'diagnostics.defaultToken': 'token?',
    'diagnostics.clipCount': '{{count}} clips',
    'diagnostics.defaultPath': 'diagnostics folder',
    'json.banner': 'Manage JSON saves and loads here. schemaVersion=1.0.7 is preserved.',
    'json.export': 'Export JSON',
    'json.import': 'Import JSON',
    'json.editorLabel': 'JSON for save/load',
    'canvas.ariaLabel': 'Node canvas',
    'toast.queueRefreshFailed': 'Failed to refresh queue: {{message}}',
    'toast.demoJobMissing': 'Demo job API is unavailable',
    'toast.demoJobAdded': 'Demo job added',
    'toast.queueFull': '{{code}}: queue is full',
    'toast.demoJobFailed': 'Failed to add job: {{reason}}',
    'toast.cancelAll': 'All jobs canceled',
    'toast.exportMissing': 'Export API is not connected',
    'toast.exportFailed': 'Export failed: {{reason}}',
    'toast.logsExported': 'Logs exported to {{path}}{{shaSuffix}}',
    'toast.logsExportedSha': ' (SHA256: {{sha}})',
    'toast.crashOn': 'Crash dumps will be included',
    'toast.crashOff': 'Crash dumps will be excluded',
    'errors.schemaMissing': 'schemaVersion is missing',
    'errors.jsonLoadFailed': 'Failed to load JSON: {{reason}}',
    'about.title': 'About & licensing',
    'about.ariaLabel': 'About and licensing',
    'about.distributionLabel': 'FFmpeg distribution',
    'about.licenseLabel': 'License',
    'about.pathLabel': 'FFmpeg path',
    'about.versionLabel': 'FFmpeg version',
    'about.origin.bundled': 'Bundled with NodeVision',
    'about.origin.external': 'External/system binary',
    'about.noticeBundled': 'NodeVision ships FFmpeg compiled under the LGPL v2.1+. Use the links below to review the license text and download matching source code.',
    'about.noticeExternal': 'FFmpeg was detected on this system. Confirm that the “{{license}}” license suits your redistribution requirements.',
    'about.licenseLinkLabel': 'License text',
    'about.sourceLinkLabel': 'FFmpeg source',
    'about.versionUnknown': 'Unknown',
    'about.licenseValue.lgpl': 'LGPL v2.1+',
    'about.licenseValue.gpl': 'GPL v3+',
    'about.licenseValue.nonfree': 'Nonfree build (--enable-nonfree)',
    'about.licenseValue.unknown': 'Unknown license',
    'nodeTemplate.loadMedia.title': 'Load Media',
    'nodeTemplate.loadMedia.description': 'Open a local image or video file',
    'nodeTemplate.loadMedia.port.media': 'Media',
    'nodeTemplate.trim.title': 'Trim',
    'nodeTemplate.trim.description': 'Cut media between in/out points',
    'nodeTemplate.trim.port.source': 'Source',
    'nodeTemplate.trim.port.result': 'Result',
    'nodeTemplate.resize.title': 'Resize',
    'nodeTemplate.resize.description': 'Resize media with aspect ratio controls',
    'nodeTemplate.resize.port.source': 'Source',
    'nodeTemplate.resize.port.resized': 'Resized',
    'nodeTemplate.overlay.title': 'Overlay',
    'nodeTemplate.overlay.description': 'Blend two sources with position controls',
    'nodeTemplate.overlay.port.base': 'Base',
    'nodeTemplate.overlay.port.layer': 'Layer',
    'nodeTemplate.overlay.port.composite': 'Composite',
    'nodeTemplate.text.title': 'Text Overlay',
    'nodeTemplate.text.description': 'Render titles or captions with font and color controls',
    'nodeTemplate.text.port.background': 'Background',
    'nodeTemplate.text.port.titled': 'Titled',
    'nodeTemplate.crop.title': 'Crop',
    'nodeTemplate.crop.description': 'Trim the visible area to a custom frame',
    'nodeTemplate.crop.port.source': 'Source',
    'nodeTemplate.crop.port.cropped': 'Cropped',
    'nodeTemplate.speed.title': 'Speed',
    'nodeTemplate.speed.description': 'Ramp playback speed for slow/fast motion',
    'nodeTemplate.speed.port.source': 'Source',
    'nodeTemplate.speed.port.retimed': 'Retimed',
    'nodeTemplate.changeFps.title': 'Change FPS',
    'nodeTemplate.changeFps.description': 'Convert variable frame rate clips to constant FPS',
    'nodeTemplate.changeFps.port.source': 'Source',
    'nodeTemplate.changeFps.port.normalized': 'Normalized',
    'nodeTemplate.export.title': 'Export Media',
    'nodeTemplate.export.description': 'Finalize and export the edited result',
    'nodeTemplate.export.port.program': 'Program',
    'nodeTemplate.export.port.delivery': 'Exported',
    'demo.jobName': 'FFmpeg demo render'
  },
  'ja-JP': {
    'app.title': 'NodeVisionエディター',
    'toolbar.alignLeft': '左揃え',
    'toolbar.alignTop': '上揃え',
    'toolbar.alignCenter': '中央揃え',
    'toolbar.undo': '元に戻す',
    'toolbar.redo': 'やり直し',
    'toolbar.runningMode': '実行中モード',
    'toolbar.localeLabel': '言語',
    'toolbar.locale.en': '英語',
    'toolbar.locale.ja': '日本語',
    'autosave.pending': '変更待ち...',
    'autosave.running': '実行中…変更を監視中 ({{seconds}}秒)',
    'autosave.idle': '変更検知 ({{seconds}}秒)',
    'autosave.saved': '{{time}} に自動保存したよ',
    'sidebar.ariaLabel': 'ノード検索とヘルプ',
    'sidebar.searchLabel': 'ノード検索',
    'sidebar.searchPlaceholder': 'ロード、トリム、リサイズ…',
    'sidebar.suggestionsLabel': 'ノード候補',
    'help.shortcutsTitle': 'ショートカット',
    'help.copy': 'ノードをコピー',
    'help.paste': '貼り付け（4pxスナップ）',
    'help.duplicate': '複製',
    'help.zoomReset': 'ズーム 100%',
    'help.fitSelection': '選択範囲にフィット',
    'help.guideTitle': '操作ガイド',
    'help.guideHtml': '・ドラッグでノード移動（4pxスナップ）<br />・Enterで候補を追加<br />・Tabでカードにフォーカスできます。',
    'readonly.banner': 'スキーマ差分のため読み取り専用です（編集は無効化）。',
    'queue.ariaLabel': 'ジョブキュー',
    'queue.title': 'ジョブキュー',
    'queue.demoJob': 'デモジョブ追加',
    'queue.cancelAll': 'すべてキャンセル',
    'queue.status.running': '実行中',
    'queue.status.queued': '待機中',
    'queue.status.coolingDown': 'クールダウン',
    'queue.status.failed': '失敗',
    'queue.status.canceled': 'キャンセル済み',
    'queue.historyTitle': '履歴 (20件)',
    'queue.emptyActive': '実行中のジョブはありません',
    'queue.emptyQueued': '待機ジョブなし',
    'queue.noHistory': '履歴はまだありません',
    'queue.noLogs': 'ログなし',
    'queue.defaultJob': 'ジョブ',
    'queue.stableTitle': 'キューは安定',
    'queue.stableSummary': '待機 {{queued}}/{{limit}} ・ タイムアウト {{timeout}}秒',
    'nodes.ariaLabel': '{{title}} ノード',
    'ports.inputsLabel': '{{title}} の入力',
    'ports.outputsLabel': '{{title}} の出力',
    'ports.emptyInputs': '入力なし',
    'ports.emptyOutputs': '出力なし',
    'ports.direction.input': '入力',
    'ports.direction.output': '出力',
    'ports.portLabel': '{{direction}}ポート {{label}} ({{dataType}})',
    'connections.title': '接続',
    'connections.ariaLabel': '接続リスト',
    'connections.empty': '接続はまだありません',
    'connections.remove': '接続を削除',
    'connections.itemLabel': '{{from}} → {{to}}',
    'connections.pending': '{{from}} から接続する入力ポートを選択してください',
    'diagnostics.ariaLabel': 'ログと診断',
    'diagnostics.title': 'ログ & 診断',
    'diagnostics.crashConsent': 'クラッシュダンプを含める',
    'diagnostics.passwordPlaceholder': 'エクスポート用パスワード',
    'diagnostics.exportButton': 'ログを書き出し',
    'diagnostics.inspectHistoryTitle': 'inspect履歴 (20件)',
    'diagnostics.noExport': 'まだエクスポートしていません',
    'diagnostics.lastExport': '最後のエクスポート: {{path}} (SHA {{sha}})',
    'diagnostics.unknownSha': '不明',
    'diagnostics.historyEmpty': '履歴はまだありません',
    'diagnostics.noDetails': '詳細なし',
    'diagnostics.defaultToken': 'トークン?',
    'diagnostics.clipCount': '{{count}} クリップ',
    'diagnostics.defaultPath': '診断フォルダー',
    'json.banner': 'JSONプロジェクトの保存/読み込みはここから。schemaVersion=1.0.7 を保持します。',
    'json.export': 'JSONを書き出し',
    'json.import': 'JSONを読み込み',
    'json.editorLabel': '保存用JSON',
    'canvas.ariaLabel': 'ノードキャンバス',
    'toast.queueRefreshFailed': 'キュー更新に失敗: {{message}}',
    'toast.demoJobMissing': 'デモジョブAPIがみつからないよ',
    'toast.demoJobAdded': 'デモジョブを追加したよ',
    'toast.queueFull': '{{code}}: 待機キューが満杯だよ',
    'toast.demoJobFailed': 'ジョブ追加に失敗したよ: {{reason}}',
    'toast.cancelAll': '全ジョブをキャンセルしたよ',
    'toast.exportMissing': 'Export APIが未接続だよ',
    'toast.exportFailed': 'エクスポートに失敗したよ: {{reason}}',
    'toast.logsExported': 'ログを {{path}}{{shaSuffix}} にエクスポートしたよ',
    'toast.logsExportedSha': ' (SHA256: {{sha}})',
    'toast.crashOn': 'クラッシュダンプを含めるよ',
    'toast.crashOff': 'クラッシュダンプを除外するよ',
    'errors.schemaMissing': 'schemaVersion がありません',
    'errors.jsonLoadFailed': 'JSONの読み込みに失敗しました: {{reason}}',
    'about.title': 'アバウトとライセンス',
    'about.ariaLabel': 'アバウトとライセンス',
    'about.distributionLabel': 'FFmpeg配布形態',
    'about.licenseLabel': 'ライセンス',
    'about.pathLabel': 'FFmpegパス',
    'about.versionLabel': 'FFmpegバージョン',
    'about.origin.bundled': 'NodeVision同梱 (LGPL)',
    'about.origin.external': '外部/システムのバイナリ',
    'about.noticeBundled': 'NodeVisionはLGPL v2.1+準拠でビルドしたFFmpegを同梱しています。下のリンクからライセンス原文と対応するソースコードにアクセスしてください。',
    'about.noticeExternal': 'このFFmpegはシステムから検出したものです（ライセンス: {{license}}）。再配布ポリシーに合っているかご確認ください。',
    'about.licenseLinkLabel': 'ライセンス原文',
    'about.sourceLinkLabel': 'FFmpegソース',
    'about.versionUnknown': '不明',
    'about.licenseValue.lgpl': 'LGPL v2.1+',
    'about.licenseValue.gpl': 'GPL v3+',
    'about.licenseValue.nonfree': '非フリー構成 (--enable-nonfree)',
    'about.licenseValue.unknown': 'ライセンス不明',
    'nodeTemplate.loadMedia.title': 'メディアを読み込み',
    'nodeTemplate.loadMedia.description': 'ローカルの画像や動画を開く',
    'nodeTemplate.loadMedia.port.media': 'メディア',
    'nodeTemplate.trim.title': 'トリム',
    'nodeTemplate.trim.description': 'IN/OUT間で素材をカット',
    'nodeTemplate.trim.port.source': 'ソース',
    'nodeTemplate.trim.port.result': '出力',
    'nodeTemplate.resize.title': 'リサイズ',
    'nodeTemplate.resize.description': 'アスペクト比を保ってサイズ変更',
    'nodeTemplate.resize.port.source': 'ソース',
    'nodeTemplate.resize.port.resized': 'リサイズ後',
    'nodeTemplate.overlay.title': 'オーバーレイ',
    'nodeTemplate.overlay.description': '2つの映像を合成して位置を調整',
    'nodeTemplate.overlay.port.base': 'ベース',
    'nodeTemplate.overlay.port.layer': 'レイヤー',
    'nodeTemplate.overlay.port.composite': '合成結果',
    'nodeTemplate.text.title': 'テキストオーバーレイ',
    'nodeTemplate.text.description': '文字や字幕を描画',
    'nodeTemplate.text.port.background': '背景',
    'nodeTemplate.text.port.titled': 'テキスト出力',
    'nodeTemplate.crop.title': 'クロップ',
    'nodeTemplate.crop.description': '表示範囲をトリミング',
    'nodeTemplate.crop.port.source': 'ソース',
    'nodeTemplate.crop.port.cropped': 'クロップ後',
    'nodeTemplate.speed.title': '再生速度',
    'nodeTemplate.speed.description': 'スロー/早回しを設定',
    'nodeTemplate.speed.port.source': 'ソース',
    'nodeTemplate.speed.port.retimed': '速度変更後',
    'nodeTemplate.changeFps.title': 'フレームレート変換',
    'nodeTemplate.changeFps.description': '可変フレームを固定フレームに揃える',
    'nodeTemplate.changeFps.port.source': 'ソース',
    'nodeTemplate.changeFps.port.normalized': '正規化後',
    'nodeTemplate.export.title': 'メディアを書き出し',
    'nodeTemplate.export.description': '最終結果を書き出す',
    'nodeTemplate.export.port.program': 'プログラム',
    'nodeTemplate.export.port.delivery': '書き出し結果',
    'demo.jobName': 'FFmpeg 合成'
  }
} as const;

type SupportedLocale = keyof typeof UI_TRANSLATIONS;
const DEFAULT_LOCALE: SupportedLocale = 'en-US';

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

const loadRendererBundle = (): string => {
  if (rendererScriptCache) {
    return rendererScriptCache;
  }

  const jsPath = resolveFirstExistingPath([
    path.resolve(__dirname, 'renderer', 'app.js'),
    path.resolve(__dirname, '..', 'dist', 'renderer', 'app.js')
  ]);
  if (jsPath) {
    rendererScriptCache = stripSourceMapComment(fs.readFileSync(jsPath, 'utf8'));
    return rendererScriptCache;
  }

  const tsPath = resolveFirstExistingPath([
    path.resolve(__dirname, 'renderer', 'app.ts'),
    path.resolve(__dirname, '..', 'src', 'renderer', 'app.ts')
  ]);
  if (tsPath) {
    const ts = loadTypescriptModule();
    const output = ts.transpileModule(fs.readFileSync(tsPath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020
      }
    }).outputText;
    rendererScriptCache = stripSourceMapComment(output);
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
        padding: 14px 18px 16px;
        min-width: 220px;
        background: linear-gradient(150deg, rgba(19, 23, 32, 0.96), rgba(12, 15, 23, 0.96));
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(12px);
        color: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: border 120ms ease, box-shadow 120ms ease, transform 120ms ease;
      }
      .node-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      .node-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .node-meta {
        margin: 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.6);
      }
      .node-description {
        margin: 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
      }
      .node-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 11px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.85);
      }
      .node.selected {
        border-color: #4e9eff;
        box-shadow: 0 0 0 2px rgba(78, 158, 255, 0.35);
      }
      .node-ports {
        display: flex;
        gap: 14px;
        align-items: flex-start;
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
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
        gap: 8px;
        flex: 1;
      }
      .ports.inputs {
        align-items: flex-start;
      }
      .ports.outputs {
        align-items: flex-end;
      }
      .port {
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        padding: 6px 12px;
        background: rgba(7, 10, 16, 0.85);
        color: inherit;
        font-size: 13px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 140px;
        justify-content: space-between;
        transition: border 120ms ease, box-shadow 120ms ease, background 120ms ease;
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
      }
      .port-type {
        font-size: 11px;
        opacity: 0.7;
        display: block;
      }
      .port:focus-visible {
        outline: 2px solid #4e9eff;
        outline-offset: 2px;
      }
      .port-dot {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255, 255, 255, 0.8);
        background: #05070d;
        box-shadow: 0 0 8px rgba(78, 158, 255, 0.5);
        flex-shrink: 0;
      }
      .port.input .port-dot {
        border-color: #f472b6;
      }
      .port.output .port-dot {
        border-color: #38bdf8;
      }
      .port-connected {
        border-color: rgba(78, 158, 255, 0.5);
        box-shadow: 0 0 0 2px rgba(78, 158, 255, 0.15);
      }
      .port-connected .port-dot {
        background: rgba(78, 158, 255, 0.8);
      }
      .port-pending {
        border-color: rgba(255, 209, 102, 0.8);
        box-shadow: 0 0 0 2px rgba(255, 209, 102, 0.35);
      }
      .port-drop-target {
        border-color: rgba(126, 255, 178, 0.9);
        box-shadow: 0 0 0 2px rgba(126, 255, 178, 0.35), 0 0 18px rgba(126, 255, 178, 0.35);
      }
      .port-drop-target .port-dot {
        border-color: #7effb2;
        background: rgba(126, 255, 178, 0.25);
      }
      .port-placeholder {
        font-size: 12px;
        opacity: 0.6;
      }
      #connection-layer path {
        fill: none;
        stroke: rgba(119, 196, 255, 0.85);
        stroke-width: 3px;
        stroke-linecap: round;
        filter: drop-shadow(0 0 6px rgba(78, 158, 255, 0.4));
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

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

const encodePayload = (payload: RendererPayload): string =>
  encodeURIComponent(JSON.stringify(payload));

const TRANSLATIONS_EMBED = JSON.stringify(UI_TRANSLATIONS);
const SUPPORTED_LOCALES_EMBED = JSON.stringify(Object.keys(UI_TRANSLATIONS));

export const buildRendererHtml = (payload: RendererPayload): string => {
  const encoded = encodePayload(payload);
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
    <script>
      const BOOTSTRAP = JSON.parse(decodeURIComponent('${encoded}'));
      const GRID = 8;
      const SNAP = 4;
      const SCHEMA = '1.0.7';
      const TRANSLATIONS = ${TRANSLATIONS_EMBED};
      const SUPPORTED_LOCALES = ${SUPPORTED_LOCALES_EMBED};
      const FALLBACK_LOCALE = '${DEFAULT_LOCALE}';
      const LOCALE_STORAGE_KEY = 'nodevision.locale';

      const readStoredLocale = () => {
        try {
          if (typeof localStorage === 'undefined') {
            return null;
          }
          return localStorage.getItem(LOCALE_STORAGE_KEY);
        } catch (error) {
          console.warn('[NodeVision] locale storage unavailable', error);
          return null;
        }
      };

      const detectLocale = () => {
        const stored = readStoredLocale();
        if (stored && TRANSLATIONS[stored]) {
          return stored;
        }
        const configured = BOOTSTRAP?.status?.settings?.locale;
        if (configured && TRANSLATIONS[configured]) {
          return configured;
        }
        const candidates = [];
        if (navigator?.language) {
          candidates.push(navigator.language);
        }
        if (Array.isArray(navigator?.languages)) {
          candidates.push(...navigator.languages);
        }
        for (const candidate of candidates) {
          if (!candidate) continue;
          const normalized = String(candidate).toLowerCase();
          const match = SUPPORTED_LOCALES.find(locale => normalized.startsWith(locale.toLowerCase()));
          if (match) {
            return match;
          }
        }
        return FALLBACK_LOCALE;
      };

      const createId = base =>
        (crypto?.randomUUID ? crypto.randomUUID() : \`\${base}-\${Date.now()}-\${Math.floor(Math.random() * 9999)}\`);
      const cssEscape = value => {
        if (window.CSS?.escape) {
          return window.CSS.escape(String(value));
        }
        return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
      };

      const elements = {
        statusList: document.getElementById('status-list'),
        canvas: document.getElementById('canvas'),
        nodeLayer: document.getElementById('node-layer'),
        connectionLayer: document.getElementById('connection-layer'),
        searchInput: document.getElementById('node-search'),
        suggestions: document.getElementById('search-suggestions'),
        autosave: document.getElementById('autosave-indicator'),
        undo: document.getElementById('btn-undo'),
        redo: document.getElementById('btn-redo'),
        json: document.getElementById('project-json'),
        export: document.getElementById('btn-export'),
        load: document.getElementById('btn-load'),
        runningToggle: document.getElementById('running-toggle'),
        localeSelect: document.getElementById('locale-select'),
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
        connectionsList: document.getElementById('connection-list'),
        connectionHint: document.getElementById('connection-pending'),
        demoJob: document.getElementById('btn-demo-job'),
        cancelAll: document.getElementById('btn-cancel-all'),
        toast: document.getElementById('toast'),
        aboutDistribution: document.getElementById('about-distribution'),
        aboutLicense: document.getElementById('about-license'),
        aboutPath: document.getElementById('about-path'),
        aboutVersion: document.getElementById('about-version'),
        aboutNotice: document.getElementById('about-notice'),
        aboutLicenseLink: document.getElementById('about-license-link'),
        aboutSourceLink: document.getElementById('about-source-link')
      };

      const deepClone = value => JSON.parse(JSON.stringify(value));

      const clonePorts = ports => (Array.isArray(ports) ? ports.map(port => ({ ...port })) : []);

      const cloneNode = node => {
        const copy = deepClone(node);
        copy.inputs = clonePorts(copy.inputs);
        copy.outputs = clonePorts(copy.outputs);
        return copy;
      };

      const cloneConnection = connection => {
        const copy = deepClone(connection);
        if (!copy.id) {
          copy.id = createId('connection');
        }
        return copy;
      };

      const DEFAULT_QUEUE_LIMITS = {
        maxParallelJobs: 1,
        maxQueueLength: 4,
        queueTimeoutMs: 180_000
      };

      const state = {
        locale: detectLocale(),
        nodes: (BOOTSTRAP.nodes ?? []).map(cloneNode),
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
        },
        connections: (BOOTSTRAP.connections ?? []).map(cloneConnection),
        pendingConnection: null,
        draggingConnection: null
      };
      let activeConnectionDrag = null;
      let dropTargetPort = null;

      const formatTemplate = (template, vars = {}) => {
        let result = template;
        for (const [token, value] of Object.entries(vars)) {
          const placeholder = '{{' + token + '}}';
          result = result.split(placeholder).join(String(value));
        }
        let cleaned = '';
        let cursor = 0;
        while (cursor < result.length) {
          const open = result.indexOf('{{', cursor);
          if (open === -1) {
            cleaned += result.slice(cursor);
            break;
          }
          cleaned += result.slice(cursor, open);
          const close = result.indexOf('}}', open + 2);
          if (close === -1) {
            break;
          }
          cursor = close + 2;
        }
        return cleaned;
      };

      const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);

      const lookupTranslation = key => {
        const localeDict = TRANSLATIONS[state.locale];
        if (localeDict && hasOwn(localeDict, key)) {
          return localeDict[key];
        }
        const fallbackDict = TRANSLATIONS[FALLBACK_LOCALE];
        if (fallbackDict && hasOwn(fallbackDict, key)) {
          return fallbackDict[key];
        }
        return null;
      };

      const translateWithFallback = (key, fallback, vars = {}) => {
        const template = lookupTranslation(key);
        const base = template ?? fallback;
        if (!base) {
          return key;
        }
        return formatTemplate(base, vars);
      };

      const t = (key, vars = {}) => translateWithFallback(key, key, vars);

      const getNodeTitle = node => translateWithFallback(\`nodeTemplate.\${node.typeId}.title\`, node.title);

      const getPortLabel = (typeId, port) =>
        translateWithFallback(\`nodeTemplate.\${typeId}.port.\${port.id}\`, port.label);

      const getTemplateTitle = template =>
        translateWithFallback(\`nodeTemplate.\${template.typeId}.title\`, template.title);

      const getTemplateDescription = template =>
        translateWithFallback(\`nodeTemplate.\${template.typeId}.description\`, template.description ?? '');

      const applyI18nAttributes = node => {
        if (!node || !node.attributes) return;
        Array.from(node.attributes).forEach(attr => {
          if (!attr.name.startsWith('data-i18n-attr-')) return;
          const target = attr.name.replace('data-i18n-attr-', '');
          const key = attr.value;
          if (!key) return;
          node.setAttribute(target, t(key));
        });
      };

      const applyTranslations = () => {
        document.documentElement.lang = state.locale;
        document.querySelectorAll('[data-i18n-key]').forEach(node => {
          const key = node.getAttribute('data-i18n-key');
          if (!key) return;
          node.textContent = t(key);
          applyI18nAttributes(node);
        });
        document.querySelectorAll('[data-i18n-html]').forEach(node => {
          const key = node.getAttribute('data-i18n-html');
          if (!key) return;
          node.innerHTML = t(key);
          applyI18nAttributes(node);
        });
        document
          .querySelectorAll('[data-i18n-attr-placeholder], [data-i18n-attr-aria-label], [data-i18n-attr-title]')
          .forEach(applyI18nAttributes);
      };

      const templates = BOOTSTRAP.templates ?? [];
      applyTranslations();

      const describeStatus = status => {
        switch (status) {
          case 'running':
            return t('queue.status.running');
          case 'queued':
            return t('queue.status.queued');
          case 'coolingDown':
            return t('queue.status.coolingDown');
          case 'failed':
            return t('queue.status.failed');
          case 'canceled':
            return t('queue.status.canceled');
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
        const renderJobs = (container, jobs, emptyKey) => {
          if (!container) return;
          if (!jobs?.length) {
            container.innerHTML = \`<p style="margin:4px 0;opacity:0.7;">\${t(emptyKey)}</p>\`;
            return;
          }
          container.innerHTML = jobs
            .map(job => \`<div class="queue-row"><span>\${escapeHtml(job.name ?? job.jobId ?? t('queue.defaultJob'))}</span><span class="queue-badge">\${describeStatus(job.status)}</span></div>\`)
            .join('');
        };

        renderJobs(elements.queueRunning, state.queue.active, 'queue.emptyActive');
        renderJobs(elements.queueQueued, state.queue.queued, 'queue.emptyQueued');
        renderQueueHistory();
        renderQueueWarnings();
      };

      const renderQueueHistory = () => {
        if (!elements.queueHistory) return;
        const history = (state.queue.history ?? []).slice(0, 20);
        if (!history.length) {
          elements.queueHistory.innerHTML = \`<p style="opacity:0.7;">\${t('queue.noHistory')}</p>\`;
          return;
        }
        elements.queueHistory.innerHTML = history
          .map(entry => {
            const level = entry.logLevel ?? 'info';
            const message = entry.message ? escapeHtml(entry.message) : t('queue.noLogs');
            const finishedAt = entry.finishedAt ?? entry.startedAt ?? null;
            return \`
              <div class="history-row">
                <div class="history-row-main">
                  <span class="history-job">\${escapeHtml(entry.name ?? t('queue.defaultJob'))}</span>
                  <span class="queue-badge">\${describeStatus(entry.status)}</span>
                  <span class="log-level-badge \${logLevelClass(level)}">\${level.toUpperCase()}</span>
                  <span class="history-time">\${formatTimestamp(finishedAt)}</span>
                </div>
                <p class="history-message">\${message}</p>
              </div>
            \`;
          })
          .join('');
      };

      const renderQueueWarnings = () => {
        if (!elements.queueWarnings) return;
        const warnings = state.queue.warnings ?? [];
        const limits = state.queue.limits ?? DEFAULT_QUEUE_LIMITS;
        if (!warnings.length) {
          const timeoutSeconds = Math.round((limits.queueTimeoutMs ?? 0) / 1000);
          elements.queueWarnings.innerHTML = \`
            <div class="queue-warning queue-warning-info">
              <strong>\${t('queue.stableTitle')}</strong>
              <span>\${t('queue.stableSummary', {
                queued: state.queue.queued?.length ?? 0,
                limit: limits.maxQueueLength,
                timeout: timeoutSeconds || 0
              })}</span>
            </div>
          \`;
          return;
        }
        elements.queueWarnings.innerHTML = warnings
          .map(warning => {
            const levelClass = warning.level === 'error' ? 'queue-warning-error' : warning.level === 'warn' ? 'queue-warning-warn' : 'queue-warning-info';
            return \`
              <div class="queue-warning \${levelClass}">
                <strong>\${warning.type}</strong>
                <span>\${escapeHtml(warning.message)}</span>
                <span class="history-time">\${formatIsoTime(warning.occurredAt)}</span>
              </div>
            \`;
          })
          .join('');
      };

      const renderDiagnostics = () => {
        if (elements.crashConsent) {
          elements.crashConsent.checked = !!state.diagnostics.collectCrashDumps;
        }
        if (elements.exportStatus) {
          if (state.diagnostics.lastLogExportPath) {
            const sha = state.diagnostics.lastExportSha ?? t('diagnostics.unknownSha');
            elements.exportStatus.textContent = t('diagnostics.lastExport', {
              path: state.diagnostics.lastLogExportPath,
              sha
            });
          } else {
            elements.exportStatus.textContent = t('diagnostics.noExport');
          }
        }
        if (elements.inspectHistory) {
          const rows = (state.diagnostics.inspectHistory ?? [])
            .slice(0, 20)
            .map(item => {
              const level = item.logLevel ?? 'info';
              const infoParts = [
                \`HTTP \${item.statusCode}\`,
                item.responseCode ?? null,
                typeof item.clipCount === 'number' ? t('diagnostics.clipCount', { count: item.clipCount }) : null,
                item.remoteAddress ?? null
              ].filter(Boolean);
              return \`
                <div class="inspect-row">
                  <div class="inspect-row-main">
                    <span class="log-level-badge \${logLevelClass(level)}">\${level.toUpperCase()}</span>
                    <span class="history-time">\${formatIsoTime(item.timestamp)}</span>
                  </div>
                  <div class="inspect-row-meta">
                    <strong>\${escapeHtml(item.tokenLabel ?? t('diagnostics.defaultToken'))}</strong>
                    <span>\${infoParts.map(part => escapeHtml(part)).join(' · ') || t('diagnostics.noDetails')}</span>
                  </div>
                </div>
              \`;
            })
            .join('');
          elements.inspectHistory.innerHTML = rows || \`<p style="opacity:0.7;">\${t('diagnostics.historyEmpty')}</p>\`;
        }
      };

      const renderConnections = () => {
        if (!elements.connectionsList) {
          renderConnectionPaths();
          return;
        }
        if (!state.connections.length) {
          elements.connectionsList.innerHTML = '<li class="connections-empty">' + t('connections.empty') + '</li>';
          renderConnectionPaths();
          return;
        }
        elements.connectionsList.innerHTML = state.connections
          .map(connection => {
            const fromNode = state.nodes.find(node => node.id === connection.fromNodeId);
            const toNode = state.nodes.find(node => node.id === connection.toNodeId);
            const fromNodeTitle = fromNode ? getNodeTitle(fromNode) : connection.fromNodeId;
            const fromPort = fromNode?.outputs?.find(port => port.id === connection.fromPortId);
            const fromPortLabel = fromPort ? getPortLabel(fromNode.typeId, fromPort) : connection.fromPortId;
            const fromLabel = fromNodeTitle + ' • ' + fromPortLabel;
            const toNodeTitle = toNode ? getNodeTitle(toNode) : connection.toNodeId;
            const toPort = toNode?.inputs?.find(port => port.id === connection.toPortId);
            const toPortLabel = toPort ? getPortLabel(toNode.typeId, toPort) : connection.toPortId;
            const toLabel = toNodeTitle + ' • ' + toPortLabel;
            const summary = t('connections.itemLabel', { from: fromLabel, to: toLabel });
            const html = [
              '<li>',
              '<span>', escapeHtml(summary), '</span>',
              '<button type="button" class="pill-button pill-danger" data-connection-id="',
              escapeHtml(connection.id),
              '">', t('connections.remove'), '</button>',
              '</li>'
            ];
            return html.join('');
          })
          .join('');
        renderConnectionPaths();
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
          showToast(t('toast.queueRefreshFailed', { message: error?.message ?? error }), 'error');
        }
      };

      const snap = value => Math.round(value / SNAP) * SNAP;

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

      const renderAbout = () => {
        const metadata = BOOTSTRAP.status?.distribution?.ffmpeg;
        if (!metadata || !elements.aboutDistribution || !elements.aboutLicense) {
          return;
        }
        const licenseKey = metadata.license ?? 'unknown';
        const licenseLabel = t(\`about.licenseValue.\${licenseKey}\`) ?? t('about.licenseValue.unknown');
        const originKey = metadata.origin === 'bundled' ? 'about.origin.bundled' : 'about.origin.external';
        elements.aboutDistribution.textContent = t(originKey);
        elements.aboutLicense.textContent = licenseLabel;
        if (elements.aboutPath) {
          elements.aboutPath.textContent = BOOTSTRAP.status.ffmpeg.ffmpeg.path;
        }
        if (elements.aboutVersion) {
          elements.aboutVersion.textContent =
            BOOTSTRAP.status.ffmpeg.ffmpeg.version ?? t('about.versionUnknown');
        }
        if (elements.aboutNotice) {
          const noticeKey = metadata.origin === 'bundled' ? 'about.noticeBundled' : 'about.noticeExternal';
          elements.aboutNotice.textContent = t(noticeKey, { license: licenseLabel });
        }
        if (elements.aboutLicenseLink && metadata.licenseUrl) {
          elements.aboutLicenseLink.setAttribute('href', metadata.licenseUrl);
        }
        if (elements.aboutSourceLink && metadata.sourceUrl) {
          elements.aboutSourceLink.setAttribute('href', metadata.sourceUrl);
        }
      };

      const setAutosaveMessage = msg => {
        elements.autosave.textContent = msg;
      };

      const updateAutosaveIdleMessage = () => {
        const seconds = state.isRunning ? 10 : 2;
        const key = state.isRunning ? 'autosave.running' : 'autosave.idle';
        setAutosaveMessage(t(key, { seconds }));
      };

      const scheduleAutosave = () => {
        if (!state.autosaveTimer) {
          updateAutosaveIdleMessage();
        }
        const delay = state.isRunning ? 10_000 : 2_000;
        clearTimeout(state.autosaveTimer);
        state.autosaveTimer = setTimeout(() => {
          state.lastAutosave = new Date();
          setAutosaveMessage(t('autosave.saved', { time: state.lastAutosave.toLocaleTimeString() }));
          state.autosaveTimer = null;
        }, delay);
      };

      const pushHistory = () => {
        state.history.splice(state.historyIndex + 1);
        state.history.push(deepClone({ nodes: state.nodes, connections: state.connections }));
        if (state.history.length > 100) {
          state.history.shift();
        }
        state.historyIndex = state.history.length - 1;
        updateUndoRedoState();
      };

      const applySnapshot = snapshot => {
        state.nodes = deepClone(snapshot.nodes);
        state.connections = deepClone(snapshot.connections ?? []);
        state.pendingConnection = null;
        state.draggingConnection = null;
        setDropTarget(null);
        state.selection.clear();
        renderNodes();
        renderConnections();
        updatePendingHint();
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

      const describePort = (node, port, direction) =>
        t('ports.portLabel', {
          direction: t(direction === 'input' ? 'ports.direction.input' : 'ports.direction.output'),
          label: getPortLabel(node.typeId, port),
          dataType: port.dataType
        });

      const portIsConnected = (nodeId, portId, direction) =>
        direction === 'input'
          ? state.connections.some(connection => connection.toNodeId === nodeId && connection.toPortId === portId)
          : state.connections.some(connection => connection.fromNodeId === nodeId && connection.fromPortId === portId);

      const portButtonHtml = (node, port, direction) => {
        const pending =
          direction === 'output' &&
          state.pendingConnection &&
          state.pendingConnection.fromNodeId === node.id &&
          state.pendingConnection.fromPortId === port.id;
        const connected = portIsConnected(node.id, port.id, direction);
        const classes = ['port', \`port-\${direction}\`];
        if (pending) {
          classes.push('port-pending');
        }
        if (connected) {
          classes.push('port-connected');
        }
        const ariaPressed = direction === 'output' ? String(pending) : 'false';
        const portLabel = getPortLabel(node.typeId, port);
        const textHtml = \`
            <span class="port-text">
              <span class="port-label">\${escapeHtml(portLabel)}</span>
              <span class="port-type">\${escapeHtml(port.dataType ?? '')}</span>
            </span>
        \`;
        const dot = '<span class="port-dot" aria-hidden="true"></span>';
        const inner = direction === 'input' ? \`\${dot}\${textHtml}\` : \`\${textHtml}\${dot}\`;
        return \`
          <button
            type="button"
            class="\${classes.join(' ')}"
            role="button"
            data-node-id="\${node.id}"
            data-port-id="\${port.id}"
            data-direction="\${direction}"
            aria-pressed="\${ariaPressed}"
            aria-label="\${escapeHtml(describePort(node, port, direction))}"
          >
            \${inner}
          </button>
        \`;
      };

      const buildPortGroup = (node, ports, direction) => {
        const displayTitle = getNodeTitle(node);
        const labelKey = direction === 'input' ? 'ports.inputsLabel' : 'ports.outputsLabel';
        const label = escapeHtml(t(labelKey, { title: displayTitle }));
        if (!ports.length) {
          const emptyKey = direction === 'input' ? 'ports.emptyInputs' : 'ports.emptyOutputs';
          const emptyLabel = escapeHtml(t(emptyKey));
          return \`
            <div class="ports \${direction}" role="group" aria-label="\${label}">
              <p class="port-placeholder">\${emptyLabel}</p>
            </div>
          \`;
        }
        return \`
          <div class="ports \${direction}" role="group" aria-label="\${label}">
            \${ports.map(port => portButtonHtml(node, port, direction)).join('')}
          </div>
        \`;
      };

      const getRelativePoint = event => {
        const rect = elements.canvas?.getBoundingClientRect();
        if (!rect) {
          return { x: 0, y: 0 };
        }
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        };
      };

      const getPortAnchorPoint = portEl => {
        if (!elements.canvas || !portEl) return null;
        const dot = portEl.querySelector('.port-dot');
        const target = dot ?? portEl;
        const rect = target.getBoundingClientRect();
        const canvasRect = elements.canvas.getBoundingClientRect();
        return {
          x: rect.left - canvasRect.left + rect.width / 2,
          y: rect.top - canvasRect.top + rect.height / 2
        };
      };

      const buildCurvePath = (start, end) => {
        const dx = end.x - start.x;
        const direction = Math.sign(dx || 1);
        const offset = Math.max(Math.abs(dx) * 0.5, 48);
        const c1x = start.x + direction * offset;
        const c2x = end.x - direction * offset;
        return (
          'M ' +
          start.x +
          ' ' +
          start.y +
          ' C ' +
          c1x +
          ' ' +
          start.y +
          ' ' +
          c2x +
          ' ' +
          end.y +
          ' ' +
          end.x +
          ' ' +
          end.y
        );
      };

      const findPortElement = (nodeId, portId, direction) => {
        const root = elements.nodeLayer ?? elements.canvas;
        if (!root) return null;
        const selector =
          '.port[data-node-id="' +
          cssEscape(nodeId) +
          '"][data-port-id="' +
          cssEscape(portId) +
          '"][data-direction="' +
          direction +
          '"]';
        return root.querySelector(selector);
      };

      const renderConnectionPaths = () => {
        if (!elements.connectionLayer || !elements.canvas) return;
        const rect = elements.canvas.getBoundingClientRect();
        elements.connectionLayer.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
        elements.connectionLayer.setAttribute('width', String(rect.width));
        elements.connectionLayer.setAttribute('height', String(rect.height));
        const segments = [];
        const pushPath = (start, end, extraClass = '') => {
          if (!start || !end) return;
          const pathMarkup =
            '<path class="connection-path' +
            extraClass +
            '" d="' +
            buildCurvePath(start, end) +
            '" />';
          segments.push(pathMarkup);
        };
        state.connections.forEach(connection => {
          const fromEl = findPortElement(connection.fromNodeId, connection.fromPortId, 'output');
          const toEl = findPortElement(connection.toNodeId, connection.toPortId, 'input');
          pushPath(getPortAnchorPoint(fromEl), getPortAnchorPoint(toEl));
        });
        if (state.draggingConnection) {
          const fromEl = findPortElement(state.draggingConnection.fromNodeId, state.draggingConnection.fromPortId, 'output');
          const startPoint = getPortAnchorPoint(fromEl);
          const endPoint = state.draggingConnection.cursor ?? startPoint;
          pushPath(startPoint, endPoint, ' connection-preview');
        }
        elements.connectionLayer.innerHTML = segments.join('');
      };

      const renderNodes = () => {
        const host = elements.nodeLayer ?? elements.canvas;
        if (!host) {
          renderConnectionPaths();
          return;
        }
        setDropTarget(null);
        host.innerHTML = '';
        state.nodes.forEach(node => {
          const localizedTitle = getNodeTitle(node);
          const template = templates.find(item => item.typeId === node.typeId);
          const description = template ? getTemplateDescription(template) : '';
          const nodeVersion = node.nodeVersion ?? '1.0.0';
          const metaText = node.typeId + ' • v' + nodeVersion;
          const el = document.createElement('div');
          el.className = 'node';
          el.dataset.id = node.id;
          el.tabIndex = 0;
          el.setAttribute('role', 'group');
          el.setAttribute('aria-label', t('nodes.ariaLabel', { title: localizedTitle }));
          el.style.transform = 'translate(' + node.position.x + 'px, ' + node.position.y + 'px)';
          const inputsGroup = buildPortGroup(node, node.inputs, 'input');
          const outputsGroup = buildPortGroup(node, node.outputs, 'output');
          const descriptionHtml = description
            ? '<p class="node-description">' + escapeHtml(description) + '</p>'
            : '';
          const htmlParts = [
            '<header class="node-header">',
            '<div>',
            '<p class="node-title">', escapeHtml(localizedTitle), '</p>',
            '<p class="node-meta">', escapeHtml(metaText), '</p>',
            descriptionHtml,
            '</div>',
            '<span class="node-chip">v', escapeHtml(nodeVersion), '</span>',
            '</header>',
            '<div class="node-ports">',
            inputsGroup,
            outputsGroup,
            '</div>'
          ];
          el.innerHTML = htmlParts.join('');
          if (state.selection.has(node.id)) {
            el.classList.add('selected');
          }
          attachNodeEvents(el, node);
          attachPortEvents(el);
          host.appendChild(el);
        });
        renderConnectionPaths();
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

      const attachPortEvents = container => {
        container.querySelectorAll('.port').forEach(portEl => {
          portEl.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handlePortActivation(portEl);
          });
          portEl.addEventListener('pointerdown', event => {
            startConnectionDrag(portEl, event);
          });
          portEl.addEventListener('pointerenter', () => {
            if (state.draggingConnection && portEl.getAttribute('data-direction') === 'input') {
              setDropTarget(portEl);
            }
          });
          portEl.addEventListener('pointerleave', () => {
            if (dropTargetPort === portEl) {
              setDropTarget(null);
            }
          });
          portEl.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handlePortActivation(portEl);
            } else if (event.key === 'Escape' && state.pendingConnection) {
              event.preventDefault();
              clearPendingConnection();
            }
          });
        });
      };

      const updatePendingHint = () => {
        if (!elements.connectionHint) return;
        if (!state.pendingConnection) {
          elements.connectionHint.textContent = '';
          return;
        }
        const fromNode = state.nodes.find(node => node.id === state.pendingConnection.fromNodeId);
        const fromLabel = fromNode ? getNodeTitle(fromNode) : state.pendingConnection.fromNodeId;
        elements.connectionHint.textContent = t('connections.pending', {
          from: fromLabel
        });
      };

      const setDropTarget = target => {
        if (dropTargetPort === target) {
          return;
        }
        if (dropTargetPort) {
          dropTargetPort.classList.remove('port-drop-target');
        }
        dropTargetPort = target ?? null;
        if (dropTargetPort) {
          dropTargetPort.classList.add('port-drop-target');
        }
      };

      const primePendingConnection = (nodeId, portId) => {
        if (
          state.pendingConnection &&
          state.pendingConnection.fromNodeId === nodeId &&
          state.pendingConnection.fromPortId === portId
        ) {
          return;
        }
        state.pendingConnection = { fromNodeId: nodeId, fromPortId: portId };
        updatePendingHint();
        renderNodes();
      };

      const handleConnectionDragMove = event => {
        if (!activeConnectionDrag) return;
        const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
        if (pointerId !== (activeConnectionDrag.pointerId ?? 1)) {
          return;
        }
        if (!activeConnectionDrag.started) {
          const distance = Math.hypot(
            event.clientX - activeConnectionDrag.origin.x,
            event.clientY - activeConnectionDrag.origin.y
          );
          if (distance > 3) {
            const nodeId = activeConnectionDrag.portEl.getAttribute('data-node-id');
            const portId = activeConnectionDrag.portEl.getAttribute('data-port-id');
            if (nodeId && portId) {
              primePendingConnection(nodeId, portId);
              activeConnectionDrag.started = true;
              state.draggingConnection = {
                fromNodeId: nodeId,
                fromPortId: portId,
                cursor: getRelativePoint(event)
              };
              renderConnectionPaths();
            }
          }
          return;
        }
        if (state.draggingConnection) {
          state.draggingConnection.cursor = getRelativePoint(event);
          renderConnectionPaths();
        }
      };

      const handleConnectionDragUp = event => {
        if (!activeConnectionDrag) return;
        const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
        if (pointerId !== (activeConnectionDrag.pointerId ?? 1)) {
          return;
        }
        if (activeConnectionDrag.started && dropTargetPort) {
          handlePortActivation(dropTargetPort);
        } else if (activeConnectionDrag.started) {
          clearPendingConnection();
        }
        endConnectionDrag();
      };

      const endConnectionDrag = () => {
        if (activeConnectionDrag) {
          window.removeEventListener('pointermove', handleConnectionDragMove);
          window.removeEventListener('pointerup', handleConnectionDragUp);
          activeConnectionDrag = null;
        }
        state.draggingConnection = null;
        setDropTarget(null);
        renderConnectionPaths();
      };

      const startConnectionDrag = (portEl, event) => {
        if (state.readonly) return;
        if (portEl.getAttribute('data-direction') !== 'output') return;
        if (typeof event.button === 'number' && event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        activeConnectionDrag = {
          portEl,
          pointerId: typeof event.pointerId === 'number' ? event.pointerId : 1,
          origin: { x: event.clientX, y: event.clientY },
          started: false
        };
        window.addEventListener('pointermove', handleConnectionDragMove);
        window.addEventListener('pointerup', handleConnectionDragUp);
      };

      const clearPendingConnection = () => {
        if (!state.pendingConnection) return;
        state.pendingConnection = null;
        updatePendingHint();
        endConnectionDrag();
        renderNodes();
      };

      const handlePortActivation = portEl => {
        const nodeId = portEl.getAttribute('data-node-id');
        const portId = portEl.getAttribute('data-port-id');
        const direction = portEl.getAttribute('data-direction');
        if (!nodeId || !portId || !direction) return;
        if (state.readonly) return;
        if (direction === 'output') {
          if (state.pendingConnection && state.pendingConnection.fromNodeId === nodeId && state.pendingConnection.fromPortId === portId) {
            clearPendingConnection();
            return;
          }
          primePendingConnection(nodeId, portId);
          return;
        }
        if (!state.pendingConnection) {
          return;
        }
        if (state.pendingConnection.fromNodeId === nodeId && state.pendingConnection.fromPortId === portId) {
          return;
        }
        const exists = state.connections.some(
          connection =>
            connection.fromNodeId === state.pendingConnection.fromNodeId &&
            connection.fromPortId === state.pendingConnection.fromPortId &&
            connection.toNodeId === nodeId &&
            connection.toPortId === portId
        );
        if (exists) {
          state.pendingConnection = null;
          updatePendingHint();
          endConnectionDrag();
          renderNodes();
          return;
        }
        const connection = {
          id: createId('connection'),
          fromNodeId: state.pendingConnection.fromNodeId,
          fromPortId: state.pendingConnection.fromPortId,
          toNodeId: nodeId,
          toPortId: portId
        };
        state.connections = [connection, ...state.connections];
        state.pendingConnection = null;
        updatePendingHint();
        endConnectionDrag();
        commitState();
      };

      const commitState = () => {
        renderNodes();
        renderConnections();
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
        connections: state.connections.map(connection => deepClone(connection)),
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
          height: template.height ?? 120,
          inputs: clonePorts(template.inputs),
          outputs: clonePorts(template.outputs)
        };
        state.nodes.push(node);
        state.selection = new Set([node.id]);
        commitState();
      };

      const updateSuggestions = query => {
        const normalized = query.trim().toLowerCase();
        const results = templates
          .filter(template => {
            if (!normalized) return true;
            const localizedTitle = getTemplateTitle(template).toLowerCase();
            const localizedDescription = getTemplateDescription(template).toLowerCase();
            const haystacks = [
              template.title.toLowerCase(),
              (template.description ?? '').toLowerCase(),
              localizedTitle,
              localizedDescription,
              ...template.keywords.map(keyword => keyword.toLowerCase())
            ];
            return haystacks.some(text => text && text.includes(normalized));
          })
          .slice(0, 6);
        elements.suggestions.innerHTML = '';
        results.forEach((template, index) => {
          const li = document.createElement('li');
          li.role = 'option';
          li.id = \`suggestion-\${index}\`;
          const localizedTitle = getTemplateTitle(template);
          const localizedDescription = getTemplateDescription(template);
          li.textContent = \`\${localizedTitle} — \${localizedDescription}\`;
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

      const buildNodeFromSerialized = node => {
        const template = templates.find(item => item.typeId === node.typeId);
        return {
          id: node.id,
          typeId: node.typeId,
          nodeVersion: node.nodeVersion ?? '1.0.0',
          title: node.title ?? node.typeId,
          position: {
            x: snap(node.position?.x ?? 0),
            y: snap(node.position?.y ?? 0)
          },
          width: template?.width ?? 220,
          height: template?.height ?? 120,
          inputs: clonePorts(template?.inputs),
          outputs: clonePorts(template?.outputs)
        };
      };

      const loadFromTextarea = () => {
        try {
          const parsed = JSON.parse(elements.json.value);
          if (!parsed.schemaVersion) {
            throw new Error(t('errors.schemaMissing'));
          }
          state.readonly = parsed.schemaVersion !== SCHEMA;
          state.nodes = (parsed.nodes ?? []).map(buildNodeFromSerialized);
          state.connections = (parsed.connections ?? []).map(cloneConnection);
          state.pendingConnection = null;
          state.selection.clear();
          updateReadonlyUi();
          renderNodes();
          renderConnections();
          updatePendingHint();
          commitState();
        } catch (error) {
          alert(t('errors.jsonLoadFailed', { reason: error.message }));
        }
      };

      const updateReadonlyUi = () => {
        document.body.classList.toggle('readonly', state.readonly);
        if (state.readonly && state.pendingConnection) {
          state.pendingConnection = null;
          updatePendingHint();
          renderNodes();
        }
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
        } else if (event.key === 'Escape' && state.pendingConnection) {
          event.preventDefault();
          clearPendingConnection();
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

      if (elements.localeSelect) {
        elements.localeSelect.value = state.locale;
        elements.localeSelect.addEventListener('change', event => {
          const target = event.target;
          if (!(target instanceof HTMLSelectElement)) {
            return;
          }
          const next = target.value;
          if (next && TRANSLATIONS[next]) {
            setLocale(next);
          }
        });
      }

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
          showToast(t('toast.demoJobMissing'), 'error');
          return;
        }
        const response = await window.nodevision.enqueueDemoJob({ name: t('demo.jobName') });
        if (response?.ok) {
          showToast(t('toast.demoJobAdded'));
        } else if (response?.code === 'QUEUE_FULL') {
          showToast(t('toast.queueFull', { code: response.code }), 'error');
        } else {
          const reason = response?.error ?? response?.message ?? 'unknown';
          showToast(t('toast.demoJobFailed', { reason }), 'error');
        }
        refreshQueue();
      };

      const cancelAllJobs = async () => {
        if (!window.nodevision?.cancelAllJobs) return;
        await window.nodevision.cancelAllJobs();
        showToast(t('toast.cancelAll'));
        refreshQueue();
      };

      const refreshLocaleDependentViews = () => {
        applyTranslations();
        renderStatus();
        renderAbout();
        renderNodes();
        renderConnections();
        updatePendingHint();
        updateSuggestions(elements.searchInput?.value ?? '');
        updateJsonPreview();
        renderQueue();
        renderDiagnostics();
        updateAutosaveIdleMessage();
      };

      const persistLocale = locale => {
        try {
          if (typeof localStorage === 'undefined') {
            return;
          }
          localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        } catch (error) {
          console.warn('[NodeVision] persist locale failed', error);
        }
      };

      const setLocale = locale => {
        if (!TRANSLATIONS[locale]) {
          return;
        }
        if (state.locale === locale) {
          persistLocale(locale);
          return;
        }
        state.locale = locale;
        persistLocale(locale);
        refreshLocaleDependentViews();
        if (elements.localeSelect) {
          elements.localeSelect.value = locale;
        }
      };

      const exportLogs = async () => {
        if (!window.nodevision?.exportLogs) {
          showToast(t('toast.exportMissing'), 'error');
          return;
        }
        const password = elements.logPassword?.value?.trim() || null;
        const response = await window.nodevision.exportLogs(password);
        if (response?.ok) {
          if (response.diagnostics) {
            state.diagnostics = response.diagnostics;
            renderDiagnostics();
          }
          const exportPath = response.result?.outputPath ?? t('diagnostics.defaultPath');
          const sha = response.result?.sha256 ?? state.diagnostics.lastExportSha ?? null;
          const shaSuffix = sha ? t('toast.logsExportedSha', { sha }) : '';
          showToast(t('toast.logsExported', { path: exportPath, shaSuffix }));
        } else {
          const reason = response?.message ?? 'unknown';
          showToast(t('toast.exportFailed', { reason }), 'error');
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
        showToast(result.collectCrashDumps ? t('toast.crashOn') : t('toast.crashOff'));
      });
      elements.connectionsList?.addEventListener('click', event => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.tagName !== 'BUTTON') return;
        const connectionId = target.getAttribute('data-connection-id');
        if (!connectionId) return;
        state.connections = state.connections.filter(connection => connection.id !== connectionId);
        commitState();
      });

      document.addEventListener('keydown', handleKeydown);

      renderStatus();
      renderAbout();
      renderNodes();
      renderConnections();
      updatePendingHint();
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

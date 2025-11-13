## 2025-11-13 Queue/Logging UI 実装
- apps/desktop-electron/ui-template.ts にジョブキュー/履歴/診断パネルと Export Logs トースト、クラッシュダンプ同意トグルを追加。preload + IPC で JobQueue スナップショット/Cancel All/ログ出力 API を公開。
- JobQueue に並列スロット・QUEUE_FULL・3分タイムアウトを導入し、Inspect HTTP サーバーは InMemoryInspectRequestHistory へ記録。log-exporter.ts で AES-256 zip + SHA256 を実装し、クラッシュダンプ同梱/同意フラグを尊重。
- `pnpm test` (vitest run --coverage) で 100% カバレッジを確認。F-01〜F-05 を doc/check list で完了済みに更新。
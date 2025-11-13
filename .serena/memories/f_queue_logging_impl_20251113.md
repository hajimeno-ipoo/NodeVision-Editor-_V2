## 2025-11-13 エンジン改修
- JobQueue を全面拡張し maxParallelJobs/queueTimeout/queueLength/auto-cancel/QueueFullError/複数実行CancelAll を実装、JobHistoryEntry に logLevel/message を追加。
- HTTP inspect サーバーへ InMemoryInspectRequestHistory を挿入できる hook を追加し、全レスポンスを info/warn/error ログとして採取。
- AES-256 暗号化付き Export Logs モジュールを `diagnostics/log-exporter.ts` に追加し、JobHistory + Inspect履歴 + クラッシュダンプを zip 化できるAPIを提供。
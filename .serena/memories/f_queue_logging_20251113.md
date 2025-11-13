## 2025-11-13 Queue/History/Logging 完了
- JobQueue をリファクタし、maxQueueLength・queueTimeoutMs・QUEUE_FULL/QUEUE_TIMEOUT警告・履歴スナップショットの拡張を追加。job-queue.test.ts で並列/Timeout/QueueFull/無効expire分岐を網羅。
- JobLogStore + QueueDiagnostics を新設し、ジョブ状態・警告・完了ログを20件リングバッファで保持。log-exporter.ts から利用可能なAES-256 ZIPエクスポート機能を実装し、検査履歴・ジョブログ・ミニダンプを含めて SHA256 を返すAPIを追加。@zip.js/zip.js を依存に採用。
- InspectHistoryStore を作成し HTTP /api/inspect/concat サーバーへ組み込み、historyStore付きでリクエストごとにstatus/エラー/clip件数/remoteAddrを記録。apps/desktop-electron に diagnostics.ts を追加し、InspectHistoryStore を main プロセスへ紐付け。
- NodeVision settings に diagnostics.collectMinidumps を追加し、nvctl/actions とテストを更新。チェックリスト F-01〜F-05 を [x] にし、証跡メモを追記。
- pnpm test を実行し、全23ファイル・173テスト・カバレッジ100%を確認。
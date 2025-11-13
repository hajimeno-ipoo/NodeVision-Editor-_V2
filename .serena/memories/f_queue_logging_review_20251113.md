## 2025-11-13 F章レビュー所感
- Export Logs のトーストが SHA256 を表示しておらず、Doc §7/AC-LOG-EXPORT-001 に未準拠。`apps/desktop-electron/src/ui-template.ts:982` でパスだけを出しているのでハッシュも表示する必要あり。
- Queue/History パネルでは `jobQueue` 履歴の `logLevel/message` を描画していないため、3分タイムアウト (`Queue timeout exceeded` メッセージ) や `QUEUE_FULL` 警告がユーザーに届かない。`renderQueue()` が名前+ステータスしか見せていない (`apps/desktop-electron/src/ui-template.ts:513-539`)。
- HTTP inspect history は `remoteAddress` や `clips` 件数を記録しておらず、Export Logs で解析できる情報が不足している。`packages/engine/src/http/inspect-server.ts:142-212` が `tokenLabel/statusCode` など最小限のみ。
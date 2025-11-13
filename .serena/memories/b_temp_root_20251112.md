## 2025-11-12 tempRoot LRU + manager
- @nodevision/system-check: `analyzeTempRoot` で top-level entry のサイズ/mtime を採取し、`enforceTempRoot` が overTotalLimit 時に LRU 順で自動削除 (deletedEntries を返す) 実装を追加。protectedEntries オプションで実行中ジョブを保護可能。
- 新しいテストで LRU 削除/保護ディレクトリ/ENOENTケースをカバー。
- apps/desktop-electron/bootstrap で `enforceTempRoot` 結果を受け取り、ResourceLimitError 詳細表示と LRU削除ログ出力を追加 (B-03)。
- packages/engine に `TempRootManager` を追加し、active job を保護したまま system-check.enforce を呼べるようにして今後のジョブ処理と統合。
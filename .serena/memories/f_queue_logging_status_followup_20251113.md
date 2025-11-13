## 2025-11-13 Queue/Logging follow-up 2
- buildQueueWarningsがhistory全体から最新のqueue timeout (message/errorMessage両対応) を拾うようアップデート。重複テストも追加。
- JobQueueのQueueFullイベントはqueue長が閾値未満まで保持し、回復時に自動クリアする設計へ変更。IPCはgetLastQueueFullEventをそのまま参照するため、ポーリング間隔による取りこぼしがなくなった。
- `pnpm test` (vitest --coverage) 176件/100%を再実行済み。
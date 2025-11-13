## 2025-11-12 Engine package baseline
- packages/engine を新設し、JobQueue + JobProgressTracker + HistoryStoreを実装。`enqueue` は maxParallel=1 を保証し、プレビュー生成 (`generatePreview`) が完了するまで次ジョブへ進まず B-01 を満たす。
- JobProgressTracker で `ratio = outputTime / totalTime` を厳密計算し、推定総時間→実測への補正ロジックとテストを追加 (B-02)。
- Cancel All は Running を即時 `cancelling` へ遷移させつつ AbortSignal で停止し、Queued を優先度低にソフトキャンセル→履歴20件へ記録する実装とユニットテストを追加 (B-04)。
- vitest alias に `@nodevision/engine` を追加し、engine専用テスト2本で挙動を検証予定 (依存 install 後に `pnpm test`).
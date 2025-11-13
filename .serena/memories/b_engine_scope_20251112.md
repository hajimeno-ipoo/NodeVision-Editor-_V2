## 2025-11-12 Checklist B scope capture
- apps/desktop-electron にはFFmpeg/HTTP初期化のみで実行エンジンは未実装。ジョブキュー/プレビュー連携/Cancel All も不在で B-01/B-04 が完全未達。
- JobProgress 定義や outputTime/totalTime モデルはコード上存在せず、テストも無いため B-02 も未実装。
- @nodevision/system-check は tempRoot の使用量を集計するだけで LRU 削除や単一ジョブ500MBガードは未実装。ResourceLimitError を投げるのみなので B-03 も未達。
- P1 拡張 (maxParallelJobs=2, キュー4件) の設計ノートやバックログは repo 内に存在しないため B-05 の要件が空欄。
- Skeleton (doc/NodeVision-skeleton-v1.0.4_secure) に旧engineサンプルがあり、history/storeやinspectが参考になるが lint 対象外。これを足掛かりに現行仕様 (v1.0.7) へ合わせた engine パッケージを再構築する必要あり。
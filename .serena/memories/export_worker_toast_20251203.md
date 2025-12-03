## 2025-12-03 LUT Worker化＆トースト通知
- 追加: renderer/nodes/lut-worker.ts (worker_threads) + lut-utils.tsにworker管理・デバウンス(schedHighResLUTViaWorker)・clampLutRes
- i18n: HQ/Export用トースト文言追加（英/日）
- プレビュー: curve-editor / primary-grading / secondary-grading / color-correction が Worker経由でHQ LUT生成＋トースト表示（開始/適用）。デバウンス200ms、requestIdleCallback。
- エクスポート: export-nodeでジョブ登録前に“生成中”、登録後“キュー投入”トースト。lutResolutionExportをIPC経由で渡し、main.tsのplanToArgsを非同期化しworker経由でLUT生成。console.infoでLUTサイズ出力。
- Main: worker管理追加、clampLutRes重複解消、planToArgs/preview生成でawait対応。
- ビルド: apps/desktop-electron で `pnpm build` 成功。
- 注意: Workerスクリプト参照パスは dist/renderer/nodes/lut-worker.js を想定。
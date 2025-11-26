## 2025-11-26 カラーコレクション：UIプレビュー枠除去＋オフスクリーン伝搬
- 変更: `apps/desktop-electron/src/renderer/nodes/color-correction.ts`
  - CanvasColorProcessor を再導入し、UIにはキャンバスを表示せずオフスクリーンで補正。
  - getSourceImageUrl を復活し、上流ロード系ノードや mediaPreviews の URL を取得して初期ロード。
  - スライダー変更時に applyCorrection し、toDataURL を接続先 mediaPreview ノードの <img> へ反映（FFmpeg/state.mediaPreviews 連携は無し）。
- テスト: `pnpm vitest run` 実行。既知の 4 件が引き続き失敗（templates.test.ts 1件、ui-template.test.ts 3件、文言/テンプレ関連）で今回変更とは無関係そう。
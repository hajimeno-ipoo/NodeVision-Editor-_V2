## 2025-11-26 カラーコレクションノードUI調整（プレビュー枠削除）
- 変更: `apps/desktop-electron/src/renderer/nodes/color-correction.ts`
  - リアルタイムプレビュー用キャンバスのHTMLブロックとCanvasColorProcessor連動ロジックを削除。
  - FFmpegプレビュー生成・mediaPreviews更新のデバウンス/処理も削除。
  - スライダーで設定をstateへ反映する挙動のみ維持。UIはスライダー群だけになる。
- テスト: `pnpm vitest run` 実行。既存と思われる4件が失敗（templates.test.ts 1件、ui-template.test.ts 3件）で、今回の変更とは無関係な文言/テンプレート欠落系。
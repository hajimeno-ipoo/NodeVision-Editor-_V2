## 2025-11-26 カラーコレクション: WebGLベース化＋Canvasフォールバック
- 変更ファイル:
  - apps/desktop-electron/src/renderer/nodes/webgl-color-processor.ts (新規): WebGLで色補正。オフスクリーンcanvasでシェーダー適用し、toDataURLで出力。
  - apps/desktop-electron/src/renderer/nodes/canvas-color-processor.ts: getSize()追加。
  - apps/desktop-electron/src/renderer/nodes/color-correction.ts: WebGL優先のprocessor選択、オフスクリーンで補正→mediaPreviewへdataURL、node自身のmediaPreviewsにも保持。
- 挙動: UIにキャンバスは出さず、WebGLが取れればGPUで処理。失敗時はCanvasに自動フォールバック。スライダー変更で即座にメディアプレビューノードへ補正後画像を配信し、再描画でもstate.mediaPreviewsから拾える。
- テスト: `pnpm vitest run` 実行。既知の4件（templates.test.ts 1件、ui-template.test.ts 3件）継続失敗、今回変更とは無関係（文言/テンプレ系）。
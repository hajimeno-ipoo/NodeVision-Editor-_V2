## 2025-11-26 カラーコレクション: レンダラー表示バッジ追加
- 変更: apps/desktop-electron/src/renderer/nodes/color-correction.ts にレンダラー種別表示を追加（WebGL / Canvas）。afterRender で選択されたプロセッサ種別に応じてバッジ文言を更新。
- 関連: WebGLColorProcessorでテクスチャ読み込み時に UNPACK_FLIP_Y_WEBGL を有効化済み。
- テスト: pnpm vitest run 実行。既知の文言/テンプレ系4件が継続失敗（今回と無関係）。
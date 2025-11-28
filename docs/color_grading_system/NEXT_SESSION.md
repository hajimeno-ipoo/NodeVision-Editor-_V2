# 次回セッションガイド: Phase 3 - Optimization & Release Prep

## 🎯 目標
Phase 2のカラーグレーディング機能実装が完了したため、システム全体の最適化、バグ修正、そしてリリースに向けた準備を行う。

## 📝 タスクリスト

### 1. コード品質向上とリファクタリング (優先度: 高)
- **Lintエラーの完全解消**:
    - `apps/desktop-electron/src/renderer/nodes/` 内の残存するLintエラー（import順序、any型、型アサーション）を修正。
    - 特に `secondary-grading.ts` や `lut-loader.ts` など、最近追加したファイルのクリーンアップ。
- **型定義の整理**:
    - `any` 型を使用している箇所を適切な型に置き換え。

### 2. パフォーマンス最適化 (優先度: 中)
- **LUT生成の最適化**:
    - パラメータ変更時のLUT再生成頻度を制御（debounce処理など）。
    - WebGLリソースの適切な管理（メモリリーク防止）。
- **UIレンダリング**:
    - 不要な再描画の抑制。

### 3. テストと検証 (優先度: 中)
- **各ノードの動作確認**:
    - Primary Grading, Curves, LUT Loader, Secondary Grading の連携動作確認。
    - エッジケース（極端な値、不正なファイルなど）の挙動確認。

## 📂 関連ファイル
- `apps/desktop-electron/src/renderer/nodes/*.ts`: レンダラー全般
- `packages/color-grading/src/**/*.ts`: コアロジック

## 💡 実装のヒント
- **Debounce**: スライダー操作時のLUT生成は重い処理なので、`lodash.debounce` などを利用して、操作終了時や一定間隔でのみ実行するようにするとUXが向上する。
- **WebGL Context**: ノードが削除された際に、作成したCanvasやWebGLコンテキスト、テクスチャなどが適切に破棄されているか確認する。

## ⚠️ 注意事項
- リファクタリング中に既存機能を壊さないように注意。

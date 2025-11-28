# カラーグレーディング実装計画

## 目的
カラーグレーディング機能を実装し、Electronアプリケーションで利用可能にする。

## 実装ステップ

### 1. ユニットテストの修正
- `packages/color-grading` 内のテストを修正し、実装の仕様に合わせる。
- 特にカーブ補間の境界値処理と、HSL Keyerのパラメータ形式に注意する。

### 2. Electronアプリケーションのビルド修正
- `apps/desktop-electron/src/main.ts` の構造的エラー（重複関数定義など）を修正する。
- 必要な関数（`buildQueueWarnings`）を実装またはインポートする。
- レンダラープロセスのコード（`color-correction.ts`, `secondary-grading.ts`）の型エラーと構文エラーを修正する。
- `packages/color-grading` をCommonJSとしてビルドするように設定を変更し、Electronメインプロセスからの読み込みエラーを解消する。

### 3. 動作確認
- Electronアプリケーションを起動し、各カラーグレーディングノードを追加して動作を確認する。
- WebGLプレビューが正しく表示されることを確認する。

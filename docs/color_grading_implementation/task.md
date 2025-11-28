# カラーグレーディングノードの実装とElectronでの動作確認

## 概要
カラーグレーディング機能（Primary Grading, Curves, LUT Loader, Secondary Grading）の実装を完了し、ユニットテストをパスさせ、Electronアプリケーションでの動作確認を行う。

## タスク
- [x] カラーグレーディングモジュールのユニットテスト修正
    - [x] `curve-math.test.ts` の修正（境界値処理、補間ロジック）
    - [x] `pipeline.test.ts` の修正（浮動小数点精度）
    - [x] `hsl-keyer.test.ts` の修正（パラメータ形式）
    - [x] `lut/parser.test.ts` の修正（型アサーション）
- [x] Electronアプリケーション (`apps/desktop-electron`) のビルドエラー修正
    - [x] `main.ts` の重複コード削除と構造修正
    - [x] `fs.writeFileSync` を `fsSync.writeFileSync` に修正
    - [x] `buildQueueWarnings` の実装追加
    - [x] `buildRendererHtml` のインポート追加
    - [x] `color-correction.ts` の構文エラーと型エラー修正
    - [x] `secondary-grading.ts` の型エラー修正
    - [x] `packages/color-grading` の `package.json` から `"type": "module"` を削除（CommonJS互換性のため）
- [ ] Electronアプリケーションでの動作確認
    - [ ] Primary Grading ノードの動作確認
    - [ ] Curves ノードの動作確認
    - [ ] LUT Loader ノードの動作確認
    - [ ] Secondary Grading ノードの動作確認

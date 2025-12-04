# Color Grading シェーダー統一プロジェクト

## 開始日
2024-12-04

## 目的
画像と動画のColor Correctionプレビューで色補正結果が異なる問題を解決し、LUT処理パイプラインと一貫した結果を得る。

## 対象ファイル
1. `apps/desktop-electron/src/renderer/nodes/webgl-color-processor.ts` - 画像プレビュー用
2. `apps/desktop-electron/src/renderer/nodes/webgl-video-processor.ts` - 動画プレビュー用

## 主な改善点
1. sRGB ↔ リニア変換をピースワイズ関数で追加
2. ルミナンス係数をRec.709に統一
3. シャドウ/ハイライト処理をsmoothstepマスクに改善
4. 処理順序をLUTパイプラインと統一

## 進捗
- [x] 実装計画作成
- [x] WebGLColorProcessor 更新 (2024-12-04 22:38)
  - sRGB/リニア変換追加
  - Rec.709ルミナンスに統一
  - smoothstepマスクによるシャドウ/ハイライト処理
- [x] WebGLVideoProcessor 更新 (2024-12-04 22:38)
  - 同様の改善を適用
  - Primary Grading (Lift/Gamma/Gain) は維持
- [x] ビルドテスト (成功 2024-12-04 22:39)
- [ ] 動作テスト
- [ ] 完了確認
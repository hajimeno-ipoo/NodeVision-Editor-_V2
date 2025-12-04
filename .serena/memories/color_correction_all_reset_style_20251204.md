## 2025-12-04 Color Correction All Resetボタンのスタイル統一
- 目的: Color CorrectionのAll ResetボタンをCurvesのAll Resetボタンと同じ見た目に揃える。
- 変更: apps/desktop-electron/src/renderer/nodes/color-correction.ts のAll Resetボタンのinline styleを、Curvesのボタンと同じ配色・余白・角丸・トランジションに更新（#e9edff背景、#cbd6ff枠、#202840文字、padding 6x10, border-radius 8px, transition）。ロジック変更なし。
- テスト: なし（スタイルのみの変更）。

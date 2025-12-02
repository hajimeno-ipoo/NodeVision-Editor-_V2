## 2025-12-02 HueカーブResolve寄せ調整
- 対象: packages/color-grading/src/curves/hue-curves.ts
- 変更:
  - Hue Hue: シフトレンジを (y-0.5)*60deg で±30°に縮小。
  - Hue Sat: スケールを中心1.0、0.5〜1.5倍にクランプ。
  - Hue Luma: Y'ベース補正に変更。HSL→RGB後に Y' を targetY = currentY + (y-0.5)*0.6 で再スケール。レンジ±0.3。
  - 補間トグル: USE_LINEAR_HUE_CURVE デフォルト true。Catmull-Romの代わりに線形補間を使用可能に。
  - 簡易リニア化オプション: APPLY_SIMPLE_LINEARIZE を追加（デフォfalse）。
- テスト: packages/color-grading で vitest を実行したが、テストファイル無しのため fail (No test files)。
- 次にやると良いこと: Hue系の挙動確認用に小さなスナップショットテストを追加するか、Resolveとの比較用サンプルを作って差分検証。
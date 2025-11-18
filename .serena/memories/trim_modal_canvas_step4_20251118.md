## Step4: 保存・派生プレビュー連携 (2025-11-18)
- 画像トリムモーダルの保存処理で回転・ズーム・反転・アスペクト比を `TrimNodeSettings` へ書き戻すよう `persistTrimSettings` の mutate 部を拡張。
- `deriveTrimPreview` パイプラインを強化：
  - 新たに `clampTrimRotation` / `clampTrimZoom` と `applyTrimTransforms` を追加し、プレビュー生成時に元フレームへ回転/ズーム/反転を適用。
  - `buildTrimSignature` にも新フィールドを含め、トランスフォーム変更時に派生プレビューが更新されるよう調整。
- 付随する `TrimNodeSettings` を使う全ロジックに clamp helper を適用し、異常値を防止。
- テスト: `pnpm vitest run packages/editor/src/templates.test.ts packages/editor/src/persistence.test.ts` と `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` を再実行（既知DOMException警告のみで全てPass）。
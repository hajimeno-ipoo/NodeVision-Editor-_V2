## Step2: 画像トリムモーダルUI刷新 (2025-11-18)
- `renderTrimImageModal` を全面改修して、上部ツールバー（ズーム±、グリッド、回転±、左右/上下反転、リセット）、中央キャンバスラッパー（グリッドオーバーレイ付き）、下部コントロール群（回転スライダー・ズームスライダー・アスペクト比セレクタ）を追加。新しい `TrimImageModalState` には回転/ズーム/反転/アスペクト/グリッド表示のドラフト値を保持。
- `ui-template.ts` に対応するスタイル（ツールボタン、コントロールカード、グリッドオーバーレイ、セレクトなど）を追加し、`.trim-image-stage` をラッパー内で扱う構造へ更新。
- 翻訳キーを `renderer/i18n.ts` に追加（英/日）して、新しいボタンやセレクタに i18n 文言を適用。
- テスト: `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅（既知の jsdom DOMException 警告のみ）。
## Step3: キャンバス＆操作ロジック実装 (2025-11-18)
- `TrimImageModalState` に回転/ズーム/反転/アスペクト/グリッドのドラフト値を追加。モーダル表示時に現在設定から初期化し、UIと同期するよう更新。
- `initializeTrimImageControls` に新ロジックを実装：
  - 画像の自然サイズからステージの `aspect-ratio` を自動設定。
  - 回転スライダー＆数値入力、ズームスライダー、アスペクト比セレクタ、ツールバー（ズーム±/グリッド/回転±/左右上下反転/リセット）にイベントを割り当てて `session` のドラフト値を更新。
  - CSS `transform` で画像を回転/ズーム/反転し、グリッドオーバーレイも追従。リセットボタンは新しいドラフト値も初期化。
- テスト: `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅（jsdom DOMException警告のみ）。
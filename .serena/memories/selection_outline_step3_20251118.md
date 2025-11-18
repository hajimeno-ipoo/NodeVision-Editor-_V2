## 2025-11-18 Selection outline step 3
- 選択枠の余白をズーム依存に変更（getSelectionPadding = SELECTION_PADDING / zoom）。どの倍率でも画面上では約6pxのバッファに保たれ、ズーム時の見た目ズレを抑制。
- `pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-layout.test.ts` を再度実行して、既存テストのパスを確認。
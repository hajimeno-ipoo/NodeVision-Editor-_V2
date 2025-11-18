## 2025-11-18 Preview scaling step 2
- ResizeObserver を renderer レイヤーに導入し、ノード DOM がリサイズされるたびに updateNodeMediaPreviewStyles を再実行してプレビュー寸法を再計算。
- Render loop で observe/unobserve を制御し、プレビューを持つノードだけ監視するように最適化。
- `pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-size.test.ts` を再実行して回帰なしを確認。
## 2025-11-18 Preview scaling step 1
- MIN_PREVIEW_WIDTH/HEIGHT とノード最小/最大サイズのレンジを見直し（220x165〜最大960x1000）で ComfyUI 風の縮小・拡大幅を確保。
- load/mediaPreview 両ノードで calculatePreviewSize の minimumNodePortion を 0.85/0.95 に指定し、ノード全体の 85〜95% をプレビューに割り当てるようにした。
- updateNodeMediaPreviewStyles でも type ごとに minimumNodePortion を渡すようにして実測と整合。
- preview-size のユニットテストを追加（0.9 portion の挙動）し、`pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-size.test.ts` が成功。
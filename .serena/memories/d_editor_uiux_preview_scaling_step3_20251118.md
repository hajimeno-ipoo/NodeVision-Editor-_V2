## 2025-11-18 Preview scaling step 3
- Chrome パディングと reserved 高さを見直し（MIN_NODE_CHROME=180/DEFAULT=260、Load=120/150、MediaPreview=80/110）してプレビュー領域の可動幅を拡大。
- preview-layout 用のユニットテストを新設し、新しい閾値が保証されるようにした。
- `pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-size.test.ts apps/desktop-electron/src/renderer/nodes/preview-layout.test.ts` を実行して合格を確認。
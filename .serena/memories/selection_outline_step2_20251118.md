## 2025-11-18 Selection outline step 2
- ノードDOMの ResizeObserver コールバックで refreshSelectionOutline() を呼ぶようにして、カードの実寸変化直後に枠が更新されるようにした。
- キャンバスのパン/ズーム（updateCanvasTransform）完了時にも枠を再計算させ、viewport や zoom の変更で発生していたズレを解消。
- `pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-layout.test.ts` を再実行し、既存テストがパスすることを確認。
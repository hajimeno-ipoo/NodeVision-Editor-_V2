## 2025-11-18 Selection outline step 1
- refreshSelectionOutline を DOM 実測ベースに刷新。選択された `.node` 要素の `getBoundingClientRect()` を取得し、canvas rect とズーム値からワールド座標へ逆変換して #selection-outline の translate/width/height をセットするようにした。
- これによりノードの拡大縮小やCSSパディング変更があっても枠が見た目にぴったり沿う。`pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-layout.test.ts` を実行して回帰なしを確認。
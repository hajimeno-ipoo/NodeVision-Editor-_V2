## 2025-11-16 キャンバス選択ツールアイコン
- `doc/icon/選択.png` をBase64で読み込み `SELECT_TOOL_ICON_SYMBOL` として `#tool-select` ボタンに埋め込み。既存の 🖱️ はフォールバック扱い。
- `.canvas-tool` を 60px円形、`.canvas-tool-icon` を 46px に再拡大し、PNGや絵文字でも一目でわかる大きさに統一。
- `apps/desktop-electron/src/ui-template.test.ts` で選択/Pan/Fit各ツールの画像埋め込みとCSSサイズを検証するテストを追加し、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で30テストPASS。
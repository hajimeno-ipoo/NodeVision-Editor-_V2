## 2025-11-16 キャンバスFitアイコン
- `doc/icon/中央.png` をBase64で読み込み `FIT_TOOL_ICON_SYMBOL` として `#btn-fit-view` ボタンへ埋め込み、既存の🎯絵文字はフォールバックに変更。
- `.canvas-tool` / `.canvas-tool-icon` 拡大スタイルをそのまま利用して、Pan/Selectと同じ大きめPNGを表示可能。
- `apps/desktop-electron/src/ui-template.test.ts` にFitアイコンのdata URIを確認するテストを追加し、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で29テストPASS。
## 2025-11-16 キャンバスPanツールアイコン
- `doc/icon/パン表示.png` をBase64化して `PAN_TOOL_ICON_SYMBOL` を追加し、`#tool-pan` ボタンに埋め込み（apps/desktop-electron/src/ui-template.ts）。従来の✋絵文字はフォールバック。
- `.canvas-tool` / `.canvas-tool-icon` の拡大スタイルを使い、選択アイコン同様に大きなPNGが表示されるように統一。
- `apps/desktop-electron/src/ui-template.test.ts` にPanアイコンのdata URIを検証するテストを追加し、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で28テストPASS。
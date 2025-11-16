## 2025-11-16 接続サイドバーアイコン
- `apps/desktop-electron/src/ui-template.ts` に `CONNECTION_PANEL_ICON_SYMBOL` を追加し、`doc/icon/接続.png` をBase64埋め込みしてパネル切替ボタンに表示。
- 既存の`iconSymbolFromAsset`ヘルパーを再利用してPNG/フォールバックSVGを切替。
- `apps/desktop-electron/src/ui-template.test.ts` に接続アイコンのdata URI検証テストを追加。
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` を再実行し、23テストすべてパス済み。
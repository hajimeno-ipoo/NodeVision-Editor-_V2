## 2025-11-16 ワークフローサイドバーアイコン
- `apps/desktop-electron/src/ui-template.ts` で `doc/icon/ワークフロー.png` をBase64埋め込みできるよう `iconSymbolFromAsset` ヘルパーを追加し、`panel-workflows` ボタンのSVGを置き換え。
- `.sidebar-icon-symbol img` スタイルを流用して既存のPNG(ノード検索)と同じ描画品質を確保。
- `apps/desktop-electron/src/ui-template.test.ts` にワークフローアイコン用のデータURI検証テストを追加し、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で22件パス済み。
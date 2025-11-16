## 2025-11-16 インフォメーション(About)サイドバーアイコン
- `apps/desktop-electron/src/ui-template.ts` に `ABOUT_PANEL_ICON_SYMBOL` を追加し、`doc/icon/インフォメーション.png` をBase64埋め込みして `panel-about` ボタンへ反映。元の情報マークSVGはフォールバックとして保持。
- `apps/desktop-electron/src/ui-template.test.ts` のサイドバーアイコンテストにAboutアイコン検証を追加。
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で25テストすべてパス済み。
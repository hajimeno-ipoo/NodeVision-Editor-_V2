## 2025-11-16 サイドバーアイコンサイズ拡大
- `.sidebar-icon` を 48px→56px、`.sidebar-icon-symbol` を 36px→44px に拡大してボタン枠も含めてアイコン画像を目立たせた（apps/desktop-electron/src/ui-template.ts）。
- SVG/PNGともに枠いっぱいへスケールする既存スタイルを維持。
- `apps/desktop-electron/src/ui-template.test.ts` のCSS検証テストを更新し、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で26テストPASS。
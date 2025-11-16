## 2025-11-16 ヘルプ/キーボードショートカットアイコン
- `apps/desktop-electron/src/ui-template.ts` に `HELP_PANEL_ICON_SYMBOL` を追加し、`doc/icon/キーボード.png` をBase64で読み込んで `panel-help` ボタンに埋め込み。
- 既存の質問マークSVGをフォールバックとして保持しつつ、PNGが見つかれば `<img>` に切り替わる仕組み。
- `apps/desktop-electron/src/ui-template.test.ts` でヘルプアイコンの `data:image/png;base64,` 埋め込みを検証するテストを追加。
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` で24テストがPASS。
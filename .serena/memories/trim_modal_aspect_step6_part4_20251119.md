Step4: ビルドと単体テスト
- `pnpm --filter desktop-electron build` で型チェックOK。
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` も 35/35 グリーン（従来の DOMException ログは既知）。
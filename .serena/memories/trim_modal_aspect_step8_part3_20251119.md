Step3: build/vitest再実行
- `pnpm --filter desktop-electron build` OK。
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` も35/35グリーンで、軸マッピング変更による型/単体回帰なしを確認。
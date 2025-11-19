Step4: build & Vitest
- `pnpm --filter desktop-electron build` で型チェックOK。
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` も 35/35 Green。
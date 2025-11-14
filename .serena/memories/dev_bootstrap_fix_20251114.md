## 2025-11-14 pnpm dev bootstrap fix
- `pnpm dev` was failing because the desktop app did not declare `@nodevision/editor`/`@nodevision/engine` as dependencies and the shared packages had no dist builds. Added workspace deps plus a repo-level `predev` hook that runs `pnpm --filter '@nodevision/*' run build` so Electron always gets fresh artifacts.
- Cleaned up `apps/desktop-electron/src/main.ts` to stop using `import.meta.url` (CommonJS build complained) and pass empty `connections` to `buildRendererHtml` per RendererPayload contract.
- Enabled package `tsconfig` excludes for `*.test.ts`/`*.spec.ts` so builds ignore Vitest sources, and tightened `@nodevision/editor` template types to expose optional `inputs`/`outputs` (fixes seed + tests type errors).
- Refreshed `@nodevision/engine` typing: removed unused imports, simplified `JobQueue` generics, added `@types/archiver`, and typed the encrypted ZIP options so the diagnostics exporter compiles. Coverage remains at 100% via `pnpm test`.

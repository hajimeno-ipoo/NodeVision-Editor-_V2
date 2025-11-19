## 2025-11-19 Renderer cast fix
- Replaced the undefined RendererWindow type casts in apps/desktop-electron/src/renderer/app.ts with RendererBootstrapWindow so TypeScript can resolve the symbol.
- `pnpm --filter desktop-electron build` now completes successfully (tsc -p tsconfig.json).
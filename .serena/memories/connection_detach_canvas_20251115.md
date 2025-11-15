## 2025-11-15 Canvas drop disconnect
- Renderer drag logic now passes `detachExisting` when a curve is released on empty canvas; `clearPendingConnection` prunes all outgoing connections for that output and commits history, so dropping the wire severs the link like ComfyUI.
- Added Vitest that drags an existing connection and verifies JSON/connection list reflect zero links.
- Build/test flow reminder: run `pnpm --filter desktop-electron build` before `pnpm test` so dist/renderer bundle picks up the latest TypeScript source.
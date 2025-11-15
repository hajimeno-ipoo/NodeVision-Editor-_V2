## 2025-11-15 ComfyUI-style nodes & drag connections
- apps/desktop-electron/src/ui-template.ts: refreshed node markup/CSS to mimic ComfyUI cards, added #node-layer/#connection-layer, and rebuilt renderNodes/renderConnections to output concatenated HTML strings.
- Added drag-to-connect interactions (pointer events, pending hints, drop targets) and bezier path rendering via renderConnectionPaths with SVG overlay.
- Updated ui-template.test.ts with PointerEvent polyfill and new connection link tests; vitest + coverage remains 100% (pnpm test).
- Avoids nested template literals by using string concatenation to keep the inline HTML/JS template stable.
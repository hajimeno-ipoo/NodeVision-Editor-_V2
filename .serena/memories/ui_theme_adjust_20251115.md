## 2025-11-15 Node-only light theme
- Re-darkened global UI (toolbar, sidebar, cards, search field) so only node cards/ports use the new ComfyUI-style light palette.
- CSS adjustments live in apps/desktop-electron/src/ui-template.ts; connection curves remain at 4px with drop shadow.
- `pnpm test` passes with 100% coverage, confirming renderer refactor + styling still stable.
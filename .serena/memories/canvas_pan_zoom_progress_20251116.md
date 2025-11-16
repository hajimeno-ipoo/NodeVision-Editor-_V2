## Canvas pan/zoom progress (2025-11-16)
- Renderer state now tracks viewport + active tool; DOM capture exposes all canvas control buttons.
- Next: add the actual toolbar markup/styles & translations, followed by renderer logic/tests.- Canvas toolbar markup/emoji icons, zoom dropdown, and translations are in place; ready to wire renderer logic and interactions next.
- Renderer interactions now support viewport pan + zoom (wheel/shortcuts/menu), with world-space node dragging, tool toggles, and zoom dropdown wiring in app.ts.
- Added ui-template regression test covering the new canvas controls and ran `pnpm test` (all green, coverage still 100%).
- Added dedicated `#canvas-grid` overlay (ui-template) with CSS vars for minor/major lines; DOM capture updated to expose it for renderer logic.
- Renderer now updates a `#canvas-grid` overlay via CSS vars for zoom-dependent spacing + offsets, and zoom control labels render Option(⌥) combos when running on macOS.
- Added ComfyUI-style grid overlay (minor/major lines) driven by zoom/viewport state plus statically Mac-style zoom shortcut labels; pnpm test + desktop build now clean.

## 2025-11-18 Trim modal corner/toolbar refresh
- Updated trim image toolbar buttons so rotate-left/right/reset show localized text labels rather than symbols for clarity.
- Reworked trim crop box styling: squared edges, new L-shaped corner handles, kept thick edge handles; bottom hint spacing and modal height/padding increased to keep tip visible without scrolling.
- Rebuilt desktop-electron UI template & renderer, ran pnpm build + vitest ui-template suites; preview HTML regenerated for manual checks.
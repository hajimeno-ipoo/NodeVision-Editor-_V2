## 2025-11-19 Trim crop step1
- Updated trim modal markup in apps/desktop-electron/src/renderer/app.ts to embed `trim-crop-grid` lines and track `data-trim-grid-visible` on the crop box for future styling logic.
- No functional JS yet beyond markup injection; existing drag/resize handlers untouched.
- Ran `pnpm test` (vitest run --coverage); all suites passed, only existing DOMException warnings from jsdom.
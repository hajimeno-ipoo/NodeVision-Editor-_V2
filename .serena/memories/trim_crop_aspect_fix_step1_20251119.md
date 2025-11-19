## 2025-11-19 Trim aspect fix step1
- startResize initial axis mapping inverted so N/S handles request width-driven constraint and E/W handles request height-driven constraint, allowing the opposite dimension to change with aspect lock.
- Files: apps/desktop-electron/src/renderer/app.ts
- Tests: `pnpm test` (Vitest full run) passed with existing jsdom DOMException warnings only.
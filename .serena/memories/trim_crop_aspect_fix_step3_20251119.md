## 2025-11-19 Trim aspect fix step3
- Added `lastPreferredAxis` state to Trim image modal and taught enforceAspect to reuse the most recent resize axis, with reset/drag handlers keeping this flag updated, so non-drag events (aspect dropdown, deferred init) respect the new axis logic.
- Files touched: apps/desktop-electron/src/renderer/app.ts (state, enforceAspect signature, handlers, reset flow).
- Tests: `pnpm test` (Vitest full) passed; jsdom DOMException warnings remain expected.
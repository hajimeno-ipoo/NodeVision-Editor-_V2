## 2025-11-19 Trim crop aspect fix – step 6 (test run)
- `pnpm test` (vitest with coverage) passes; only expected jsdom DOMException warnings emitted from ui-template suites.
- `pnpm test:playwright tests/playwright/trim-aspect-ratio.spec.ts` now passes, confirming the new image-space aspect enforcement keeps presets square/4:3/16:9 stable even after dragging N/E handles sequentially.
- Preview HTML regenerated under tmp/nodevision-preview.html during the Playwright run for manual inspection.
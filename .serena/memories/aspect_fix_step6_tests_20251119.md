## 2025-11-19 Trim crop aspect fix – step 6 (tests)
- Cleaned Trim aspect Playwright spec by dropping the unused measureCropBox helper and unused offsets so ESLint passes cleanly.
- Extended the regression test to drag the east handle after the north handle to assert the preset ratio survives both vertical and horizontal-only adjustments for presets square/4:3/16:9.
- Verified with `pnpm exec eslint tests/playwright/trim-aspect-ratio.spec.ts`.
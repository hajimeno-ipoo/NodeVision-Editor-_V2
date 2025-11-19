## 2025-11-19 Trim crop aspect fix – step 7 (test runs)
- `pnpm test` ✅ (Vitest suites all green; expected jsdom DOMException logs only).
- `pnpm test:playwright tests/playwright/trim-aspect-ratio.spec.ts` ✅ covers every non-free preset with the new drag scenarios.
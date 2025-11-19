## 2025-11-19 Trim aspect fix step2b
- Removed the premature preferredAxis branch in applyAspectConstraint so new regions derive from the user-modified draft region instead of the original reference, leaving candidate selection to the width/height projections while still honoring forced axes.
- Tests: `pnpm test` (Vitest full run) passed with standard jsdom DOMException logs only.
## 2025-11-19 Trim aspect fix step2
- applyAspectConstraint now honors preferredAxis unconditionally so forced width (vertical handles) and forced height (horizontal handles) keep responding even when touching boundaries.
- Added comments for clarity and simplified fallback return.
- Tests: `pnpm test` full Vitest suite passed (same jsdom DOMException logs as usual).
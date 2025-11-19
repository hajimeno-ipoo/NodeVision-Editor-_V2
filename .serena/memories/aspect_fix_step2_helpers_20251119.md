## 2025-11-19 Aspect fix step2
- Added normalized clamp usage inside applyAspectConstraint’s projectCandidate so each candidate is clamped in image space before converting back to stage coords; ensures letterbox offsets don’t distort ratio selection.
- Tests: `pnpm test` (Vitest full run) passed; only pre-existing jsdom DOMException warnings observed.
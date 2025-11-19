## 2025-11-19 Trim aspect fix step3b
- enforceAspect callers now pass `null` when re-centering (reset, aspect select, initial load) so the new preferredAxis tracking only applies to direct handle drags. Added pointer listeners directly on crop handles while leaving stage fallback for freeform drags.
- Tests: `pnpm test` full run succeeded (expected jsdom DOMException warnings only).
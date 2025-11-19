## 2025-11-19 Trim aspect fix step1b
- Added explicit pointerdown listeners on each trim-crop-handle and improved the fallback hit-test to use composedPath/elementsFromPoint with margin padding. Stage listener now captures drags anywhere inside the stage, but true handles short-circuit to startResize.
- Tests: `pnpm test` (Vitest full run) succeeded; only existing jsdom DOMException logs observed.
## Step1 (schema + template) 2025-11-18
- Extended `@nodevision/editor` types: `EditorNode`/`NodeTemplate`/`SerializedProject` now carry optional `settings`, introduced `TrimNodeSettings` + `TrimRegion` primitives.
- Added `defaultSettings` to the Trim template (`packages/editor/src/templates.ts`) and cloning helpers so `seedDemoNodes` + `NodeSearchIndex.instantiate` copy ports/settings consistently.
- Tests: `pnpm vitest run packages/editor/src/templates.test.ts packages/editor/src/search.test.ts packages/editor/src/state.test.ts` 🟢
- Ready for Step2 (renderer bootstrap + serialization wiring).
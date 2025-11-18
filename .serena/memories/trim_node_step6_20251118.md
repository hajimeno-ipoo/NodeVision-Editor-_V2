## Step6 (engine linkage prep) 2025-11-18
- Updated `packages/editor/src/persistence.ts` so serialized nodes include deep-cloned `settings`, and deserialization hydrates them (defaulting to template settings when absent). Added Vitest to guard the round-trip.
- This ensures workflows saved via renderer now carry Trim start/end/strictCut into the engine pipeline (builder already consumes `startMs/endMs`).
- Tests: `pnpm vitest run packages/editor/src/templates.test.ts packages/editor/src/search.test.ts packages/editor/src/state.test.ts packages/editor/src/persistence.test.ts` ✅.
## 2025-11-19 Trim crop aspect fix – step 6 (types)
- Updated packages/editor/src/types.ts so TrimAspectMode union includes the expanded preset list (2:1, 3:1, 3:2, 5:4, 16:10, 1.618:1) used by the renderer UI.
- Rebuilt @nodevision/editor before re-running `pnpm --filter desktop-electron build`; tsc now passes again for apps/desktop-electron after the preset expansion.
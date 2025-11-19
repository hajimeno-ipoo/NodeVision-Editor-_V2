## 2025-11-19 Trim crop aspect fix – step 7 (boundary handling)
- Pixel solvers now return boundary flags and min/max constraint logic so width/height shrink automatically when they would exceed the display edges; selection logic prefers candidates that aren’t clamped to the edges unless necessary.
- `toImageRegionFromPixels` now carries boundary metadata, and pickImageCandidate keeps this info when finalizing the region.
- Check: `pnpm --filter desktop-electron build` ✅
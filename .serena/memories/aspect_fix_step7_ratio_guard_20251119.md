## 2025-11-19 Trim crop aspect fix – step 7 (ratio guard)
- Added pixel-domain solvers solveFromHeight / solveFromWidth with min/max bounds derived from displayWidth/displayHeight so widthPx = targetRatio * heightPx is always satisfied after clamps.
- Image candidates now come from `toImageRegionFromPixels`, ensuring both axes respect the same ratio math before stage conversion.
- Check: `pnpm --filter desktop-electron build` ✅
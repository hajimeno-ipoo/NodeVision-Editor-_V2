## 2025-11-19 Trim crop aspect fix – step 7 (pixel pipeline)
- applyAspectConstraint now converts stage→image widths/heights into real pixel sizes before computing ratio adjustments (helpers normalizedToPixels / pixelsToNormalized + clampPixelSize).
- Width/height candidates are rebuilt from pixel math to prepare for strict ratio enforcement in later steps.
- Check: `pnpm --filter desktop-electron build` ✅
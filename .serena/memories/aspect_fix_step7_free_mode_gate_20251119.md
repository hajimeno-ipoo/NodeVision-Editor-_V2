## 2025-11-19 Trim crop aspect fix – step 7 (free-mode gate)
- startResize now skips applyAspectConstraint when the aspect mode is 'free', while every other preset funnels through the new pixel-based solver path so fixed ratios can’t bypass enforcement.
- Check: `pnpm --filter desktop-electron build` ✅
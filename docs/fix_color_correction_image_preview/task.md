# Task: Fix Color Correction Image Preview

- [/] Investigate why Color Correction works for video but not images <!-- id: 0 -->
- [x] Identify missing `propagateToMediaPreview` call in `color-correction.ts` <!-- id: 1 -->
- [x] Fix `color-correction.ts` to update preview after HQ LUT generation <!-- id: 2 -->
- [x] Fix `propagateToMediaPreview` to update connected Media Preview DOM <!-- id: 4 -->
- [x] Fix infinite render loop by adding `forceRender` flag <!-- id: 5 -->
- [x] Optimize `updateValueAndPreview` to skip HQ generation on interaction <!-- id: 6 -->
- [x] Update event listeners to separate `input` (preview) and `change` (HQ) <!-- id: 7 -->
- [ ] Verify the fix (User to verify) <!-- id: 3 -->

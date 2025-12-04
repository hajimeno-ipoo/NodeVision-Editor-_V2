# Implementation Plan - Fix Color Correction Image Preview

## Goal
Fix the issue where the Color Correction node does not update the image preview after generating a high-quality LUT.

## Proposed Changes
### `apps/desktop-electron/src/renderer/nodes/color-correction.ts`
- [MODIFY] Add `propagateToMediaPreview(node, processor)` call inside the `scheduleHighResLUTViaWorker` callback.

## Verification Plan
- Verify that the image preview updates when sliders are moved.
- Verify that the "HQ LUT 適用！" toast appears and the image reflects the high-quality LUT.

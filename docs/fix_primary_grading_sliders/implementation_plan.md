# Implementation Plan - Fix Primary Grading Sliders

## Problem
- Sliders in Primary Grading node are laggy or unresponsive when using video input.
- Color wheels are difficult to interact with (click/drag issues).
- Interacting with controls often triggers node selection or dragging.

## Proposed Changes

### 1. Optimize Video Preview Update
- **File**: `apps/desktop-electron/src/renderer/nodes/primary-grading.ts`
- **Change**: In `updateValueAndPreview`, check if the source is video. If so, skip the expensive `generateLUT3D` and `OffscreenCanvas` rendering. Instead, directly call `videoProcessor.applyPrimaryGrading(settings)`.

### 2. Fix Slider Interaction
- **File**: `apps/desktop-electron/src/renderer/nodes/primary-grading.ts`
- **Change**:
    - Add `z-index: 10` and `pointer-events: auto` to slider inputs.
    - Add `data-node-interactive="true"` attribute to sliders.
    - Add `mousedown` event listener with `e.stopPropagation()` (but NOT `preventDefault`) to prevent node dragging while allowing slider interaction.

### 3. Fix Color Wheel Interaction
- **File**: `apps/desktop-electron/src/renderer/nodes/primary-grading.ts`
- **Change**:
    - Add `data-node-interactive="true"` to wheel container and SVG.
    - Change event listeners from `mousedown`/`mousemove`/`mouseup` to `pointerdown`/`pointermove`/`pointerup`.
    - Use `element.setPointerCapture(e.pointerId)` on `pointerdown` to ensure drag events are captured even if the cursor moves outside the element.
    - Use `element.releasePointerCapture(e.pointerId)` on `pointerup`.
    - Add `e.stopPropagation()` and `e.preventDefault()` to `pointerdown`, `pointerup`, and `click` events to completely block node selection logic.

### 4. WebGL Video Processor Update
- **File**: `apps/desktop-electron/src/renderer/nodes/webgl-video-processor.ts`
- **Change**: Ensure `applyPrimaryGrading` updates the uniforms correctly for Lift, Gamma, and Gain. (Already implemented in previous steps, just verification).

## Verification Plan
- Load a video into the editor.
- Connect to Primary Grading node.
- Drag Exposure/Contrast sliders -> Should be smooth and update video in real-time.
- Click and drag Color Wheels -> Should move indicator smoothly.
- Release Color Wheel -> Drag should stop immediately.
- After releasing Color Wheel -> Node should NOT be selected.

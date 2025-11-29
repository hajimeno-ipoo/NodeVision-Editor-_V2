# Task: Fix Primary Grading Sliders and Color Wheels

## Status
- [x] Fix sliders not updating smoothly for video previews
- [x] Fix color wheels not being clickable
- [x] Fix color wheels drag behavior (not stopping when released)
- [x] Fix node selection triggering after color wheel interaction
- [x] Clean up debugging code

## Context
The Primary Grading node had issues with user interaction when processing video content. Sliders were unresponsive or laggy, and color wheels had various interaction bugs including inability to click, drag not stopping, and unintended node selection.

## Solution
1. **Video Preview Performance**: Optimized `updateValueAndPreview` to skip heavy LUT generation for video sources, using `WebGLVideoProcessor` directly.
2. **Slider Interaction**: Added `z-index` and `pointer-events` to sliders, and implemented `stopPropagation` on `mousedown` to prevent node dragging interference.
3. **Color Wheel Interaction**:
    - Added `data-node-interactive="true"` to wheel elements.
    - Switched from `mousedown` to `pointerdown` for better event handling.
    - Implemented `setPointerCapture` to reliably track dragging.
    - Added `stopPropagation` and `preventDefault` to `pointerup` and `click` events to prevent node selection.

# Fix Color Correction Image Preview

## Problem
The user reported that the **Color Correction** node works for videos but not for images.
Upon investigation, it was found that while the High-Quality (HQ) LUT was being generated (either via worker or sync fallback), the result was rendered to the internal canvas but **not propagated** to the `Media Preview` node. This meant the user continued to see the initial (potentially uncorrected or low-res) state.

## Solution
I modified `apps/desktop-electron/src/renderer/nodes/color-correction.ts` to explicitly call `propagateToMediaPreview` inside the `scheduleHighResLUTViaWorker` callback.

### Changes

#### `apps/desktop-electron/src/renderer/nodes/color-correction.ts`

```typescript
scheduleHighResLUTViaWorker(
    `${node.id}-color-correction`,
    200,
    () => settings,
    highRes,
    (hiLut) => {
        lutCache.set(node.id, { params: paramsHash, lut: hiLut });
        processor.loadLUT(hiLut);
        processor.renderWithCurrentTexture();
        // Added this line to ensure the UI updates with the new render
        propagateToMediaPreview(node, processor); 
        toastHQApplied();
    },
    'legacyColor',
    toastHQStart,
    toastHQError
);
```

#### `apps/desktop-electron/src/renderer/nodes/color-correction.ts` (propagateToMediaPreview)

Modified `propagateToMediaPreview` to explicitly find and update the `<img>` tag in connected Media Preview nodes. This ensures that even if the state is updated, the DOM reflects the change immediately without waiting for a full re-render (which doesn't happen automatically for state changes).

```typescript
// Inside propagateToMediaPreview
if (dataUrl) {
    // ... state update ...

    // Update connected Media Preview nodes
    const connectedPreviewNodes = state.connections
        .filter(c => c.fromNodeId === node.id)
        .map(c => c.toNodeId)
        .filter((id, index, self) => self.indexOf(id) === index);

    connectedPreviewNodes.forEach(previewNodeId => {
        const previewNode = state.nodes.find(n => n.id === previewNodeId);
        if (previewNode && previewNode.typeId === 'mediaPreview') {
            const nodeElement = document.querySelector(`[data-node-id="${previewNodeId}"]`);
            if (nodeElement) {
                const img = nodeElement.querySelector('img');
                if (img) {
                    img.src = dataUrl!;
                } else {
                    // If no img tag, we need to re-render to show the image
                    context.renderNodes();
                }
            }
        }
    });
}
```

#### `apps/desktop-electron/src/renderer/nodes/color-correction.ts` (Infinite Loop Fix)

1.  Added a `forceRender` flag to `propagateToMediaPreview` to prevent infinite recursion. `context.renderNodes()` is now only called when `forceRender` is true.
2.  Updated `updateValueAndPreview` to accept a `forceRender` flag.
3.  Passed `forceRender: false` when calling `updateValueAndPreview` during the initial node render.

```typescript
// propagateToMediaPreview signature
const propagateToMediaPreview = (node: RendererNode, processor: Processor | WebGLVideoProcessor | undefined, forceRender = false) => {
    // ...
    if (forceRender) {
        context.renderNodes();
    }
    // ...
};

// updateValueAndPreview signature
const updateValueAndPreview = (key: keyof ColorCorrectionNodeSettings, val: number, forceRender = true) => {
    // ...
    propagateToMediaPreview(node, processor, forceRender);
};

// Initialization block
if (sourceMedia) {
    // ...
    // Trigger update without forcing render to avoid infinite loop
    updateValueAndPreview('exposure', settings.exposure ?? 0, false, false);
}
```

#### `apps/desktop-electron/src/renderer/nodes/color-correction.ts` (Slider Performance Optimization)

1.  Modified `updateValueAndPreview` to accept a `highRes` flag (default `true`).
2.  If `highRes` is `false`, `scheduleHighResLUTViaWorker` is skipped, preventing synchronous fallback lag during rapid updates.
3.  Updated event listeners:
    *   `input` event (drag): Calls `updateValueAndPreview` with `highRes = false` for fast, low-res preview.
    *   `change` event (release): Calls `updateValueAndPreview` with `highRes = true` to trigger high-quality LUT generation.

```typescript
// updateValueAndPreview signature
const updateValueAndPreview = (key: keyof ColorCorrectionNodeSettings, val: number, forceRender = true, highRes = true) => {
    // ...
    if (highRes) {
        scheduleHighResLUTViaWorker(...);
    }
    // ...
};

// Event Listeners
inputs.forEach(input => {
    // Dragging (Fast, Low-Res)
    input.addEventListener('input', (e) => {
        // ...
        updateValueAndPreview(key, val, true, false); // highRes=false
    });

    // Release (High-Res)
    input.addEventListener('change', (e) => {
        // ...
        updateValueAndPreview(key, val, true, true); // highRes=true
    });
});
```

## Verification
1.  Load an image into the **Color Correction** node.
2.  **Verify that the application does not crash.**
3.  Adjust sliders (e.g., Contrast, Saturation) rapidly.
4.  **Verify that the slider movement is smooth and the preview updates in real-time.**
5.  Stop adjusting the slider.
6.  **Verify that the "HQ LUT 適用！" toast appears shortly after releasing the slider.**

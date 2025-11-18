## 2025-11-18 Trim aspect lock fix
- Reworked `applyAspectConstraint` to evaluate width/height candidates against the desired aspect ratio and pick the closest match so the crop region actually reflects the selection, including edge-handle anchoring.
- Restored normalized ratio to `target / imageAspect` so the stored region matches the final export ratio, but now the comparison logic prevents it from defaulting to 1:1.
- Updated `render-preview` stub to use `loadImage`/`mediaPreview` nodes so Playwright can upload `doc/ハロウィン.png` and verify the modal visually; rebuilt + Vitest suite passing.
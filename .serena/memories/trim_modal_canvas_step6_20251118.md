## 2025-11-18 Trim modal image UX refresh
- Added edge resize handles + bigger hit areas in renderer `initializeTrimImageControls` so users can drag N/S/E/W as well as corners.
- Rebuilt trim modal markup + CSS (NV modal width/height, padding, crop box box-sizing, zoom button sizing, close button centering, stage spacing) to remove internal scrolling and align the yellow highlight with the image canvas.
- Recompiled `desktop-electron` UI template + re-rendered preview HTML, Vitest suite (`ui-template*.test.ts`) still green.
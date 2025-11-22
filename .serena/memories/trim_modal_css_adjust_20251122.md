Adjusted trim modal sizing to prevent large media overflow.
- Updated CSS in apps/desktop-electron/src/ui-template.ts: set trim-stage-wrapper max-width 96vw and overflow hidden; trim-image-stage now constrained to width min(90vw, 920px) and height min(70vh, 720px); added max-width/max-height to img.
- Rebuilt desktop-electron: tsc -p tsconfig.json passes.
- This should keep large images inside modal viewport.
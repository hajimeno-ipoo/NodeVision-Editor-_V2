Ran Playwright+Electron after Cropper refactor (2025-11-22)
- Command: ELECTRON_RUN_AS_NODE= ELECTRON_ENABLE_LOGGING=1 ELECTRON_DISABLE_GPU=1 node (playwright electron.launch) with sample media.
- Steps automated: load sample-720p.mp4 into loadVideo; search "trim" → add trim node; move nodes; connect loadVideo -> trim -> mediaPreview; click trim modal; capture screenshot.
- Screenshot: tmp/playwright-trim-modal.png (latest build).
- Selection overlay pointer-events disabled in script to avoid blocking clicks.
- electron window event succeeded (no timeout now).
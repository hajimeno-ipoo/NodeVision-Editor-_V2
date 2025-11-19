## 2025-11-19 Trim crop step3
- updateTransformStyles now syncs crop box dataset + CSS var so grid rotation/visibility follow rotation + showGrid flag; grid overlay class kept for compatibility.
- Added CSS transform hook via --trim-grid-rotation and dataset-based opacity for thirds lines.
- Ran `pnpm test` again; vitest suite green with existing jsdom DOMException chatter only.
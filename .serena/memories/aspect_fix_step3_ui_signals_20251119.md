## 2025-11-19 Aspect fix step3
- updateCropBoxStyles now records both stage-spaceと画像スペースでのアスペクト比（data-trim-stage-ratio / data-trim-image-ratio）を計算し、UI側でも正しい比率が維持されているか簡単に検証できるようにした。
- Tests: `pnpm test` (Vitest full run) success; usual jsdom DOMException warningsのみ。
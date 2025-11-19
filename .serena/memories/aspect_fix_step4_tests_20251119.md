## 2025-11-19 Aspect fix step4
- Reworked tests/playwright/trim-aspect-ratio.spec.ts: removed brittle height-delta test, added preset loop (square/4:3/16:9) that measures the crop’s image-space ratio via DOM metrics to ensure it remains near the expected value after handle drags.
- Added helpers dragHandle/getImageRatio plus new tolerance constant.
- Test run `pnpm test:playwright tests/playwright/trim-aspect-ratio.spec.ts` currently fails because the crop ratio still deviates by ~0.47 (confirming the bug persists).
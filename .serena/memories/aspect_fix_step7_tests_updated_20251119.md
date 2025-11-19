## 2025-11-19 Trim crop aspect fix – step 7 (Playwright coverage)
- Expanded tests/playwright/trim-aspect-ratio.spec.ts to iterate every non-free preset (original, square, 2:1 … 1.618:1) and added dragCropBox helper + natural ratio helper.
- Ratio検証はcropBoxの実ピクセル比のみで判定し、南／東ハンドルをステージ端までドラッグしても TOL 以内か確認するように変更。
- Check: `pnpm exec eslint tests/playwright/trim-aspect-ratio.spec.ts` ✅
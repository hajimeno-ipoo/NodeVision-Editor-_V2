## 2025-11-28
- Fixed TypeScript parse error in apps/desktop-electron/src/main.ts by removing duplicate/partial planToArgs definition at file top (unmatched braces).
- Added missing imports buildQueueWarnings/buildRendererHtml, switched LUT export to fsSync.writeFileSync, and pruned unused planToArgs duplication.
- Guarded canvas toDataURL calls against OffscreenCanvas in color-correction.ts and primary-grading.ts; removed unused saveCanvasPreview helper.
- pnpm --filter desktop-electron build now passes (tsc).

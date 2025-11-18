## Step4 (preview linkage) 2025-11-18
- Implemented derived media previews for Trim nodes: `apps/desktop-electron/src/renderer/app.ts` now captures upstream image/video frames, crops them by `settings.region`, and stores cloned previews marked with `derivedFrom` so Media Preview nodes show the trimmed output.
- Added shared trim helpers (`trim-shared.ts`), guarded URL ownership in `cleanupMediaPreview`, extended `NodeMediaPreview` with `ownedUrl/derivedFrom`, and ensured Load nodes mark previews as owned.
- Rendering pass now schedules trim preview refreshes; if capture fails we fall back to shared previews without revoking the source URL.
- Tests: `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` ✅ after rebuilding `desktop-electron` bundle.
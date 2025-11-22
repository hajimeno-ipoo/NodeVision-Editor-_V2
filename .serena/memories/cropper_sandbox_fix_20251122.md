2025-11-22: Fixed Cropper.js not loading in Electron renderer.
- Root cause: preload ran in sandboxed context (BrowserWindow default) so `import Cropper from 'cropperjs'` failed -> preload aborted -> nodevision bridge missing, Cropper stub used.
- Changes:
  - apps/desktop-electron/src/preload.ts: load cropper with guarded require attempts (`cropperjs`, ../node_modules/cropperjs, ../../node_modules/cropperjs), avoid top-level import so preload never crashes. Expose Cropper only when found.
  - apps/desktop-electron/src/main.ts: set webPreferences.sandbox=false to restore full Node APIs in preload (process.cwd etc.).
  - apps/desktop-electron/src/renderer/app.ts: add resolveCropper helper that tries window.Cropper then window.nodeRequire('cropperjs') before falling back to stub, adds warning on failure.
- Build/tests: `pnpm --filter desktop-electron build` and full `pnpm test` (29 files) pass with 100% coverage.
- Playwright/Electron sanity: launch now shows hasCropper true (window.Cropper present). Module paths observed include apps/desktop-electron/node_modules.
- Screenshot: tmp/playwright-uploaded.png (after image upload; modal automation pending).
Pending: automate trim modal open via Playwright for screenshot; UI flow needs node creation/connection scripting.
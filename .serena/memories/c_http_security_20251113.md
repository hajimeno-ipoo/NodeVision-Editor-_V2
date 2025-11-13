## 2025-11-13 Checklist C implementation
- Implemented `packages/engine/src/inspect/concat.ts` with path safety validation, ffprobe metadata parsing, equality checks, and exported helpers (ratio parsing, network path detection).
- Added comprehensive unit tests for inspect/concat, covering error cases, metadata includes, branch coverage, and helper utilities (33 tests total).
- Created `packages/engine/src/http/inspect-server.ts` to host the guarded HTTP `/api/inspect/concat` endpoint (localhost-only, token validation, rate limiting, payload limits, timeout handling). Wrote 23 tests validating auth, error paths, helper utilities, and request lifecycle edge cases.
- Wired Electron main bootstrap (`apps/desktop-electron/src/main.ts`) to start/stop the HTTP server only when `NV_HTTP=1` and settings allow; token manager is reused for validation.
- Running `pnpm test` now achieves 100% statements/branches/functions/lines coverage across packages.
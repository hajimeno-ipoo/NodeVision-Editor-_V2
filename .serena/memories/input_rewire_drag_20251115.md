## 2025-11-15 Input-side rewire drag
- Users can now grab an existing cable from an input port: pointerdown on the input removes the current connection, primes the originating output, and starts a forced drag so the wire follows the cursor immediately (ComfyUI-style).
- Dropping on the canvas leaves the connection removed; dropping on another input reconnects to the new target. PendingConnection tracks `detachedConnectionId` so canvas drops commit even if the removal happened earlier.
- Tests in apps/desktop-electron/src/ui-template.test.ts cover both disconnect and rewire flows.
## 2025-11-19 Affinity crop UI research
- Located crop UI stack via Serena: render logic in apps/desktop-electron/src/renderer/app.ts and styles in apps/desktop-electron/src/ui-template.ts.
- Chrome DevTools preview confirmed current trim modal lacks grid when no image source is attached; handles exist but are large yellow pills.
- Context7 pulled official Electron BrowserWindow docs just to re-validate renderer context before inspecting DOM.
- Web research on Affinity Photo crop tool (rule-of-thirds overlay, edge drag + darken border toggles) captured feature set for parity.
- Next implementation step: add grid element inside trim-crop-box, restyle handles + overlay, wire session.showGrid to new grid, and keep stage overlay optional for legacy grid toggle.
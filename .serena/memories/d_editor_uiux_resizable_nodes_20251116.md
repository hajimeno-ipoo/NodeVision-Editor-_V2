## 2025-11-16 Node resizing UX
- Replaced +/- controls with corner drag handles on each node; handles honor min/max bounds (width 260-520px, height 320-640px) and update node position when resizing from north/west edges.
- Renderer state now tracks per-node width/height & active resize session, so resizing is smooth without full re-render; handles are marked interactive to avoid interfering with node drag.
- CSS gives handles visible targets around the node and keeps previews in a stable card layout; pnpm build/test remain green (jsdom warnings only).
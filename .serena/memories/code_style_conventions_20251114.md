## Code style & conventions (2025-11-14)
- Language: TypeScript strict across packages/apps; Electron main uses CommonJS (no `import.meta`). Keep files ASCII unless existing Unicode.
- UI template: renderer HTML/CSS/JS lives inside `apps/desktop-electron/src/ui-template.ts`, exported via template literal; keep translations via `t(key, locale)` dictionary for en-US/ja-JP, update `formatMessage` fallback logic when adding strings.
- Layout: enforce 8px base grid, 4px snapping, ComfyUI-inspired node cards, explicit ARIA roles/labels, `role="application"` for canvas, and accessible focus order.
- Comments: only when logic is non-obvious; prefer descriptive naming over verbose comments.
- Tests: Vitest + jsdom. Each change must keep coverage at 100%, adding tests for new logic (renderers/test utilities exist in same package). Use provided helper hooks (e.g., `mockRendererDom()`).
- Docs: before implementation re-read `doc/schedule/NodeVision_Implementation_Schedule_v1.0.7.md` and `doc/check list/NodeVision_Implementation_Checklist_v1.0.7.md`; update doc/reports & checklist when AC met.
- Workflow: follow Plan → Implement → Unit Test → Fix loop, updating Serena plan status each step and logging progress memos (topic_YYYYMMDD). Maintain ja-JP/en-US UI parity.
- Security constraints: HTTP disabled unless explicitly enabled with env + token; clip paths normalized; tempRoot LRU enforced; queue states and log export AES-256 requirements.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:` ...).
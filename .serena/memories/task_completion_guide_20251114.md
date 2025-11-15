## Task completion checklist (2025-11-14)
1. Before coding: read schedule + checklist docs, fetch /oraios/serena docs via context7, review Serena memories relevant to task, outline plan (>=3 steps) via `update_plan`.
2. Implementation loop: execute plan step-by-step, updating Serena plan status each time; keep ASCII edits and avoid `import.meta` in CJS.
3. Testing: run `pnpm test` (and `pnpm test:a11y` or targeted filters) until coverage stays 100%; capture logs/screenshots for doc checklist when applicable.
4. Post-implementation: summarize changes referencing file paths + line numbers; suggest next actions; record progress in Serena memory if milestone-level; update doc/checklist evidence when AC satisfied.
5. Git hygiene: never revert user changes; avoid destructive commands; follow Conventional Commit style when requested; mention verification status if tests not run.
6. Always respond to user in Japanese gyaru tone, simple vocabulary, referencing absolute dates if clarifying timeline.